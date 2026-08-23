// cloudfunctions/submitOutbound/index.js
// 【已改造】支持操作前快照，可回退
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }); 
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  
  // 1. 接收参数
  const { productId, quantity, remark } = event;
  // 将数量转为数字，防止计算错误
  const qty = parseInt(quantity, 10);

  // --- 基础校验 ---
  if (!productId) {
    return { success: false, message: '产品ID缺失，无法出库' };
  }
  if (isNaN(qty) || qty <= 0) {
    return { success: false, message: '出库数量必须大于0' };
  }

  try {
    // 开启事务：保证"快照→扣库存→记流水"原子性操作
    await db.runTransaction(async transaction => {
      
      // --- 步骤 A: 查找该零件的库存信息 ---
      const productRes = await transaction.collection('products').doc(productId).get();

      if (!productRes.data) {
        throw new Error('未找到该零件信息，请检查是否已入库');
      }

      const product = productRes.data;
      const currentStock = product.stock || 0;

      // --- 步骤 B: 校验库存是否充足 ---
      if (currentStock < qty) {
        throw new Error(`库存不足！当前库存: ${currentStock}，申请出库: ${qty}`);
      }

      // --- 步骤 C: 【新增】创建操作前快照 ---
      // 查询原操作人姓名（用于回退日志显示）
      let operatorName = '';
      try {
        const empRes = await transaction.collection('employees')
          .where({ _openid: wxContext.OPENID })
          .limit(1)
          .get();
        if (empRes.data.length > 0) {
          operatorName = empRes.data[0].name || '';
        }
      } catch (e) {
        console.warn('[submitOutbound] 查询操作人姓名失败:', e);
      }

      const snapshotResult = await transaction.collection('operation_snapshots').add({
        data: {
          operation_type: 'outbound',
          target_collection: 'products',
          target_doc_id: productId,
          snapshot_data: { ...product },            // 深拷贝出库前完整数据
          operation_payload: { quantity: -qty, remark: remark || '暂无备注' },
          related_log_id: '',
          operator_openid: wxContext.OPENID,
          operator_name: operatorName,               // 🆕 操作人姓名
          status: 'active',
          create_time: new Date(),
          revert_time: null,
          reverted_by: null,
          revert_remark: ''
        }
      });
      const snapshotId = snapshotResult._id;

      // --- 步骤 D: 扣减库存 (更新 products 表) ---
      await transaction.collection('products').doc(productId).update({
        data: {
          stock: _.inc(-qty) 
        }
      });

      // --- 步骤 E: 记录流水（含snapshot_id）---
      const logResult = await transaction.collection('transaction_logs').add({
        data: {
          product_id: productId, 
          oe_no: product.oe_no || '',
          kyb_no: product.kyb_no || '', 
          quantity: -qty, // 出库记为负数
          type: 'outbound',
          _openid: wxContext.OPENID,
          remark: remark || '暂无备注',
          snapshot_id: snapshotId,                  // 【新增】关联快照
          create_time: db.serverDate()
        }
      });

      // --- 步骤 F: 【新增】回填流水ID到快照 ---
      await transaction.collection('operation_snapshots').doc(snapshotId).update({
        data: { related_log_id: logResult._id }
      });
    });

    return { success: true, message: '出库成功' };

  } catch (err) {
    console.error('出库事务失败:', err);
    return { success: false, message: err.message || '出库失败' };
  }
};
