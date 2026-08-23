// cloudfunctions/createSnapshot/index.js
// 操作前快照创建云函数 —— 被产品编辑等场景调用
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const {
    operationType,
    targetCollection,
    targetDocId,
    snapshotData,
    payload
  } = event;

  // 参数校验
  if (!operationType || !targetCollection || !targetDocId) {
    return { success: false, message: '缺少必要参数(operationType/targetCollection/targetDocId)' };
  }

  try {
    // 🆕 查询操作人姓名（用于回退日志显示）
    let operatorName = '';
    try {
      const empRes = await db.collection('employees')
        .where({ _openid: wxContext.OPENID })
        .limit(1)
        .get();
      if (empRes.data.length > 0) {
        operatorName = empRes.data[0].name || '';
      }
    } catch (e) {
      console.warn('[createSnapshot] 查询操作人姓名失败:', e);
    }

    const result = await db.collection('operation_snapshots').add({
      data: {
        operation_type: operationType,
        target_collection: targetCollection,
        target_doc_id: targetDocId,
        snapshot_data: snapshotData || null,
        operation_payload: payload || {},
        related_log_id: '',
        operator_openid: wxContext.OPENID,
        operator_name: operatorName,              // 🆕 操作人姓名
        status: 'active',
        create_time: db.serverDate(),
        revert_time: null,
        reverted_by: null,
        revert_remark: ''
      }
    });

    console.log(`[createSnapshot] 快照创建成功 | type=${operationType} | target=${targetDocId} | operator=${operatorName} | snapshotId=${result._id}`);

    return { success: true, snapshotId: result._id };
  } catch (err) {
    console.error('[createSnapshot] 创建快照失败:', err);
    return { success: false, message: err.message };
  }
};
