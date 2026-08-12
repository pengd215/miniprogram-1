// cloudfunctions/managePermission/index.js
// 管理权限：管理员给员工分配角色
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 允许的角色白名单
const ROLE_WHITELIST = ['admin', 'warehouse_manager', 'sales', 'worker', 'customer'];

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const currentOpenId = wxContext.OPENID;
  const { action } = event;

  if (!currentOpenId) {
    return { success: false, code: 401, message: '未获取到用户身份' };
  }

  // 校验调用者必须是管理员
  const role = await getUserRole(currentOpenId);
  if (!role) {
    return { success: false, code: 403, message: '未找到员工信息，无权操作' };
  }
  if (role !== 'admin') {
    return { success: false, code: 403, message: '仅管理员可进行权限管理' };
  }

  try {
    switch (action) {
      case 'listEmployees': return await listEmployees();
      case 'updateRole': return await updateRole(event);
      default: return { success: false, message: '未知操作' };
    }
  } catch (err) {
    console.error('managePermission 出错:', err);
    return { success: false, message: '服务器内部错误: ' + err.message };
  }
};

// 根据 openid 查员工角色
async function getUserRole(openid) {
  const res = await db.collection('employees')
    .where({ _openid: openid })
    .limit(1)
    .get();
  if (res.data.length === 0) return null;
  return res.data[0].role || 'guest';
}

// 列出所有员工
async function listEmployees() {
  const res = await db.collection('employees')
    .field({
      _id: true,
      name: true,
      username: true,
      role: true
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
  const empRes = await db.collection('employees').doc(employeeId).get();
  if (!empRes.data) {
    return { success: false, message: '员工不存在' };
  }

  await db.collection('employees').doc(employeeId).update({
    data: {
      role: newRole,
      update_time: db.serverDate()
    }
  });
  return { success: true, message: '角色已更新' };
}