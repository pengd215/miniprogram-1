// cloudfunctions/updateWarningConfig/index.js
const cloud = require('wx-server-sdk');

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 允许修改全局预警配置的角色
const ALLOWED_ROLES = ['admin', 'warehouse_manager'];

exports.main = async (event, context) => {
  // 1. 获取当前操作用户的 OpenID
  const wxContext = cloud.getWXContext();
  const currentOpenId = wxContext.OPENID;

  // 2. 从事件中取操作类型与参数
  const { action, lowStock, maxStock } = event;

  try {
    // 2.1 若未登录（无 openid），直接拒绝
    if (!currentOpenId) {
      return { success: false, code: 401, message: '未获取到用户身份' };
    }

    // 3. 根据 openid 查员工表，确认身份与角色
    const empRes = await db.collection('employees')
      .where({ _openid: currentOpenId })
      .limit(1)
      .get();

    if (empRes.data.length === 0) {
      return { success: false, code: 403, message: '未找到员工信息，无权操作' };
    }

    const role = empRes.data[0].role || 'guest';

    // 4. 角色权限校验：非管理员/仓管无权修改
    if (!ALLOWED_ROLES.includes(role)) {
      return { success: false, code: 403, message: '当前角色无权修改全局预警配置' };
    }

    const warningDoc = db.collection('settings').doc('warning');

    // 5. 读取配置
    if (action === 'get') {
      const res = await warningDoc.get();
      const d = res.data || {};
      return {
        success: true,
        data: {
          lowStock: d.lowStock || 10,
          maxStock: d.maxStock || 100
        }
      };
    }

    // 6. 保存配置（仅允许 write 操作）
    if (action === 'set') {
      const low = Number(lowStock);
      const max = Number(maxStock);
      if (isNaN(low) || low < 0) {
        return { success: false, message: '最低预警值无效' };
      }

      const configData = {
        lowStock: low,
        maxStock: isNaN(max) ? 100 : max,
        update_time: db.serverDate()
      };

      // 优先 update，失败则 set（云函数是管理员权限，此处不会因集合权限受限）
      try {
        await warningDoc.update({ data: configData });
      } catch (e) {
        await warningDoc.set({ data: configData });
      }

      return { success: true, message: '保存成功' };
    }

    return { success: false, message: '未知操作类型' };
  } catch (err) {
    console.error('updateWarningConfig 出错:', err);
    return { success: false, message: '服务器内部错误: ' + err.message };
  }
};