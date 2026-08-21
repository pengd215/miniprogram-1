// cloudfunctions/managePermission/index.js
// 管理权限：管理员管理员工档案（列表 / 新增 / 改角色 / 启停 / 删除）
const crypto = require('crypto');
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 允许的角色白名单
const ROLE_WHITELIST = ['admin', 'warehouse_manager', 'sales', 'worker', 'customer'];

// 密码哈希：与 userLogin 保持一致，格式 "salt:hash"（sha256(盐+密码)）
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(s + password).digest('hex');
  return s + ':' + hash;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const currentOpenId = wxContext.OPENID;
  const { action } = event;

  if (!currentOpenId) {
    return { success: false, code: 401, message: '未获取到用户身份' };
  }

  // 校验调用者必须是管理员，同时拿到调用者本人的员工记录（用于自保护校验）
  const caller = await getEmployeeByOpenid(currentOpenId);
  if (!caller) {
    return { success: false, code: 403, message: '未找到员工信息，无权操作' };
  }
  if (caller.role !== 'admin') {
    return { success: false, code: 403, message: '仅管理员可进行权限管理' };
  }

  try {
    switch (action) {
      case 'listEmployees': return await listEmployees();
      case 'updateRole': return await updateRole(event);
      case 'createEmployee': return await createEmployee(event);
      case 'updateStatus': return await updateStatus(event);
      case 'deleteEmployee': return await deleteEmployee(event, caller);
      default: return { success: false, message: '未知操作' };
    }
  } catch (err) {
    console.error('managePermission 出错:', err);
    return { success: false, message: '服务器内部错误: ' + err.message };
  }
};

// 根据 openid 查员工记录
async function getEmployeeByOpenid(openid) {
  const res = await db.collection('employees')
    .where({ _openid: openid })
    .limit(1)
    .get();
  if (res.data.length === 0) return null;
  return res.data[0];
}

// 列出所有员工（含 status，兼容存量无该字段的数据）
async function listEmployees() {
  const res = await db.collection('employees')
    .field({
      _id: true,
      name: true,
      username: true,
      role: true,
      status: true
    })
    .orderBy('name', 'asc')
    .limit(1000)
    .get();
  return { success: true, data: res.data };
}

// 修改员工角色
async function updateRole(event) {
  const { employeeId, newRole } = event;
  if (!employeeId) {
    return { success: false, message: '缺少员工ID' };
  }
  if (!ROLE_WHITELIST.includes(newRole)) {
    return { success: false, message: '无效的角色' };
  }

  // 校验员工存在
  let empRes;
  try {
    empRes = await db.collection('employees').doc(employeeId).get();
  } catch (e) {
    // 文档不存在时 SDK 抛异常，返回员工不存在
    return { success: false, message: '员工不存在' };
  }
  if (!empRes.data) {
    return { success: false, message: '员工不存在' };
  }
  const oldRole = empRes.data.role || 'guest';

  // 【保护】至少保留一名管理员：若将被降级的员工当前是 admin，先检查其他 admin 是否存在
  if (oldRole === 'admin' && newRole !== 'admin') {
    const adminCount = await db.collection('employees')
      .where({ role: 'admin' })
      .count();
    if (adminCount.total <= 1) {
      return { success: false, message: '系统至少需要保留一名管理员，无法降级' };
    }
  }

  await db.collection('employees').doc(employeeId).update({
    data: {
      role: newRole,
      update_time: db.serverDate()
    }
  });
  return { success: true, message: '角色已更新' };
}

// 新增员工：姓名 + 账号 + 密码（哈希存储） + 角色
async function createEmployee(event) {
  const { name, username, password, role } = event;

  const trimName = (name || '').trim();
  const trimUsername = (username || '').trim();

  if (!trimName) {
    return { success: false, message: '请输入姓名' };
  }
  if (!trimUsername || !/^[A-Za-z0-9_]{3,20}$/.test(trimUsername)) {
    return { success: false, message: '账号需为3-20位字母、数字或下划线' };
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return { success: false, message: '密码至少6位' };
  }
  if (!ROLE_WHITELIST.includes(role)) {
    return { success: false, message: '无效的角色' };
  }

  // 账号唯一性校验
  const dup = await db.collection('employees')
    .where({ username: trimUsername })
    .count();
  if (dup.total > 0) {
    return { success: false, message: '该账号已存在，请更换' };
  }

  await db.collection('employees').add({
    data: {
      name: trimName,
      username: trimUsername,
      password: hashPassword(password),
      role,
      status: 'active',       // active=在职/启用，disabled=离职/停用
      create_time: db.serverDate(),
      update_time: db.serverDate()
    }
  });
  return { success: true, message: '员工已创建' };
}

// 启用 / 停用员工账号
async function updateStatus(event) {
  const { employeeId, newStatus } = event;
  if (!employeeId) {
    return { success: false, message: '缺少员工ID' };
  }
  if (newStatus !== 'active' && newStatus !== 'disabled') {
    return { success: false, message: '无效的状态' };
  }

  // 校验员工存在
  let empRes;
  try {
    empRes = await db.collection('employees').doc(employeeId).get();
  } catch (e) {
    return { success: false, message: '员工不存在' };
  }
  if (!empRes.data) {
    return { success: false, message: '员工不存在' };
  }

  // 【保护】停用最后一名在职管理员会导致系统无人可管理
  if (empRes.data.role === 'admin' && newStatus === 'disabled') {
    const activeAdmin = await db.collection('employees')
      .where({
        role: 'admin',
        status: _.neq('disabled')
      })
      .count();
    if (activeAdmin.total <= 1) {
      return { success: false, message: '系统至少需要保留一名在职管理员，无法停用' };
    }
  }

  await db.collection('employees').doc(employeeId).update({
    data: {
      status: newStatus,
      update_time: db.serverDate()
    }
  });
  return { success: true, message: newStatus === 'active' ? '已启用' : '已停用' };
}

// 删除员工（敏感操作，前端已做二次确认）
async function deleteEmployee(event, caller) {
  const { employeeId } = event;
  if (!employeeId) {
    return { success: false, message: '缺少员工ID' };
  }

  // 【保护】不允许删除当前操作的管理员本人（删除后 openid 绑定丢失，自己将无法登录）
  if (caller._id === employeeId) {
    return { success: false, message: '不能删除当前登录的管理员账号' };
  }

  // 校验员工存在
  let empRes;
  try {
    empRes = await db.collection('employees').doc(employeeId).get();
  } catch (e) {
    return { success: false, message: '员工不存在' };
  }
  if (!empRes.data) {
    return { success: false, message: '员工不存在' };
  }

  // 【保护】至少保留一名管理员
  if (empRes.data.role === 'admin') {
    const adminCount = await db.collection('employees')
      .where({ role: 'admin' })
      .count();
    if (adminCount.total <= 1) {
      return { success: false, message: '系统至少需要保留一名管理员，无法删除' };
    }
  }

  await db.collection('employees').doc(employeeId).remove();
  return { success: true, message: '已删除' };
}
