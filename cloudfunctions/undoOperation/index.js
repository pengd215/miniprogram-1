// cloudfunctions/undoOperation/index.js
// ==================== 操作回退核心云函数 ====================
// 支持回退的操作类型：
//   - inbound       → 扣减库存（抵消入库）
//   - outbound      → 增加库存（抵消出库）
//   - product_create → 软删除产品及关联流水

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// ========== 权限配置 ==========
const UNDO_ALLOWED_ROLES = ['admin', 'warehouse_manager'];

/**
 * 主入口
 */
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const currentOpenId = wxContext.OPENID;
  const { snapshotId, remark } = event;

  // ====== 1. 参数校验 ======
  if (!snapshotId) {
    return { success: false, code: 400, message: '缺少快照ID' };
  }
  if (!remark || !remark.trim()) {
    return { success: false, code: 400, message: '请填写回退原因' };
  }

  // ====== 2. 权限校验 ======
  const role = await getUserRole(currentOpenId);
  if (!UNDO_ALLOWED_ROLES.includes(role)) {
    return { success: false, code: 403, message: `权限不足：当前角色[${role}]无法执行回退操作` };
  }

  try {
    // ====== 3. 读取快照 ======
    const snapDoc = await db.collection('operation_snapshots').doc(snapshotId).get();
    if (!snapDoc.data) {
      return { success: false, code: 404, message: '快照记录不存在' };
    }
    const snapshot = snapDoc.data;

    // ====== 4. 状态检查 ======
    if (snapshot.status === 'reverted') {
      return { success: false, code: 409, message: '该操作已被回退，不可重复操作' };
    }
    if (snapshot.status === 'expired') {
      return { success: false, code: 410, message: '该操作已超过回退有效期' };
    }
    if (snapshot.status !== 'active') {
      return { success: false, code: 400, message: `快照状态异常: ${snapshot.status}` };
    }

    // ====== 5. 根据操作类型执行对应回退策略 ======
    let revertResult;
    switch (snapshot.operation_type) {
      case 'inbound':
        revertResult = await revertInbound(snapshot);
        break;
      case 'outbound':
        revertResult = await revertOutbound(snapshot);
        break;
      case 'product_create':
        revertResult = await revertProductCreate(snapshot, remark.trim());
        break;
      default:
        return { success: false, code: 400, message: `不支持回退的操作类型: ${snapshot.operation_type}` };
    }

    // ====== 6. 更新快照状态为"已回退" ======
    // 获取当前执行回退的操作人姓名
    let reverterName = '';
    try {
      const revEmp = await db.collection('employees')
        .where({ _openid: currentOpenId })
        .limit(1)
        .get();
      if (revEmp.data.length > 0) {
        reverterName = revEmp.data[0].name || '';
      }
    } catch (e) {
      console.warn('[undoOperation] 查询回退执行人姓名失败:', e);
    }

    // 获取原操作人姓名（优先使用快照中已保存的，否则查询 employees 表）
    let originalOperatorName = snapshot.operator_name || '';
    if (!originalOperatorName && snapshot.operator_openid) {
      try {
        const origEmp = await db.collection('employees')
          .where({ _openid: snapshot.operator_openid })
          .limit(1)
          .get();
        if (origEmp.data.length > 0) {
          originalOperatorName = origEmp.data[0].name || '';
        }
      } catch (e) {
        console.warn('[undoOperation] 查询原操作人姓名失败:', e);
      }
    }
    // 如果仍然没有姓名，降级显示 openid（兼容旧快照）
    const displayOriginalOperator = originalOperatorName || snapshot.operator_openid || '未知';

    await db.collection('operation_snapshots').doc(snapshotId).update({
      data: {
        status: 'reverted',
        revert_time: db.serverDate(),
        reverted_by: currentOpenId,
        reverted_by_name: reverterName,           // 🆕 回退执行人姓名
        revert_remark: remark.trim()
      }
    });

    // ====== 7. 记录回退操作日志 ======
    await db.collection('transaction_logs').add({
      data: {
        type: 'undo',
        product_id: snapshot.target_doc_id,
        oe_no: snapshot.snapshot_data?.oe_no || '',
        kyb_no: snapshot.snapshot_data?.kyb_no || '',
        quantity: 0,
        remark: `【回退${getOperationTypeName(snapshot.operation_type)}】${remark.trim()} | 原操作人: ${displayOriginalOperator}`,
        _openid: currentOpenId,
        related_undo_snapshot_id: snapshotId,
        create_time: db.serverDate()
      }
    });

    console.log(`[undoOperation] 回退成功 | type=${snapshot.operation_type} | by=${currentOpenId}`);

    return {
      success: true,
      message: `成功回退${getOperationTypeName(snapshot.operation_type)}操作`,
      revertedType: snapshot.operation_type,
      ...revertResult
    };

  } catch (err) {
    console.error('[undoOperation] 回退操作失败:', err);
    return { success: false, code: 500, message: err.message || '服务器内部错误' };
  }
};

// ==================== 各类型回退实现 ====================

/**
 * 回退入库操作
 * 策略：扣减与入库等量的库存（事务保证）
 */
async function revertInbound(snapshot) {
  const { target_doc_id, operation_payload } = snapshot;
  const qtyToDeduct = operation_payload.quantity || 0;

  return await db.runTransaction(async transaction => {
    // 1. 读取当前产品
    const productRes = await transaction.collection('products').doc(target_doc_id).get();
    if (!productRes.data) throw new Error('产品不存在，无法回退入库');

    const currentStock = Number(productRes.data.stock) || 0;
    if (currentStock < qtyToDeduct) {
      throw new Error(
        `回退失败：当前库存(${currentStock})不足以抵消原入库量(${qtyToDeduct})，` +
        `可能已被出库消耗。请联系管理员手动调整。`
      );
    }

    // 2. 扣减库存
    await transaction.collection('products').doc(target_doc_id).update({
      data: { stock: _.inc(-qtyToDeduct) }
    });

    return {
      deductedQty: qtyToDeduct,
      message: `已抵消入库数量 ${qtyToDeduct}，库存恢复到操作前水平`
    };
  });
}

/**
 * 回退出库操作
 * 策略：增加与出库等量的库存
 */
async function revertOutbound(snapshot) {
  const { target_doc_id, operation_payload } = snapshot;
  const qtyToAdd = Math.abs(operation_payload.quantity) || 0;

  await db.collection('products').doc(target_doc_id).update({
    data: { stock: _.inc(qtyToAdd) }
  });

  return {
    restoredQty: qtyToAdd,
    message: `已恢复出库数量 ${qtyToAdd}`
  };
}

/**
 * 回退产品创建操作
 * 策略：软删除（标记 deleted），保留审计痕迹
 */
async function revertProductCreate(snapshot, reason) {
  const { target_doc_id } = snapshot;

  // 软删除：添加删除标记而非物理删除
  await db.collection('products').doc(target_doc_id).update({
    data: {
      status: 'deleted',
      deleted_at: db.serverDate(),
      delete_reason: `回退创建操作: ${reason}`
    }
  });

  // 同时将该产品的所有相关流水标记作废
  await db.collection('transaction_logs')
    .where({ product_id: target_doc_id })
    .update({
      data: { is_voided: true, void_reason: '关联产品已回退创建' }
    });

  return {
    message: '产品已标记为删除(软删除)，关联流水已作废'
  };
}

// ==================== 工具函数 ====================

async function getUserRole(openid) {
  if (!openid) return null;
  try {
    const res = await db.collection('employees')
      .where({ _openid: openid })
      .limit(1)
      .get();
    if (res.data.length === 0) return null;
    return res.data[0].role || 'guest';
  } catch (e) {
    console.error('[getUserRole] 查询角色失败:', e);
    return null;
  }
}

function getOperationTypeName(type) {
  const map = {
    'inbound': '入库',
    'outbound': '出库',
    'product_create': '产品创建',
    'warehouse_op': '仓库管理'
  };
  return map[type] || type;
}
