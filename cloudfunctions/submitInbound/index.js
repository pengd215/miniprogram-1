// cloudfunctions/submitInbound/index.js
// 【已改造】支持操作前快照，可回退
const cloud = require('wx-server-sdk');

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }); 
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  // 1. 获取当前操作人的 OpenID
  const wxContext = cloud.getWXContext();
  const currentOpenId = wxContext.OPENID; 

  // 2. 接收前端传来的参数
  const { productId, model, quantity, remark } = event;
  
  // 参数校验：将数量转为数字
  const num = parseInt(quantity, 10);
  
  if (!productId) {
    return { success: false, message: '产品ID缺失，请从首页进入入库流程' };
  }
  if (isNaN(num) || num <= 0) {
    return { success: false, message: '入库数量必须大于0' };
  }

  try {
    // 开启数据库事务（保证库存更新、快照、流水记录原子性）
    return await db.runTransaction(async transaction => {
      
      // --- 第一步：查找零件 ---
      const productDoc = await transaction.collection('products').doc(productId).get();

      // --- 第二步：判断是否存在 ---
      if (!productDoc.data) {
         throw new Error('产品不存在，请检查ID有效性');
      }
      const product = productDoc.data;

      // --- 第三步：【新增】创建操作前快照 ---
      // 查询原操作人姓名（用于回退日志显示）
      let operatorName = '';
      try {
        const empRes = await transaction.collection('employees')
          .where({ _openid: currentOpenId })
          .limit(1)
          .get();
        if (empRes.data.length > 0) {
          operatorName = empRes.data[0].name || '';
        }
      } catch (e) {
        console.warn('[submitInbound] 查询操作人姓名失败:', e);
      }

      const snapshotResult = await transaction.collection('operation_snapshots').add({
        data: {
          operation_type: 'inbound',
          target_collection: 'products',
          target_doc_id: productId,
          snapshot_data: { ...product },           // 深拷贝入库前完整数据
          operation_payload: { quantity: num, remark: remark || '无备注' },
          related_log_id: '',                      // 等流水写入后回填
          operator_openid: currentOpenId,
          operator_name: operatorName,             // 🆕 操作人姓名
          status: 'active',                        // 可回退状态
          create_time: new Date(),
          revert_time: null,
          reverted_by: null,
          revert_remark: ''
        }
      });
      const snapshotId = snapshotResult._id;

      // --- 第四步：更新库存 (兼容字符串/数字类型) ---
      const oldStock = Number(productDoc.data.stock);
      const safeOldStock = isNaN(oldStock) ? 0 : oldStock;
      
      const newStock = safeOldStock + num;

      // 使用新值直接覆盖写入（绕过 _.inc 的类型限制）
      await transaction.collection('products').doc(productId).update({
        data: {
          stock: newStock 
        }
      });

      // --- 第五步：记录流水日志（关联快照ID）---
      const logResult = await transaction.collection('transaction_logs').add({
        data: {
          product_id: productId,    
          oe_no: product.oe_no || '',   
          kyb_no: product.kyb_no || '',
          model: product.model || '',
          type: 'inbound',          
          _openid: currentOpenId,  
          quantity: num,            
          remark: remark || '无备注', 
          snapshot_id: snapshotId,               // 【新增】关联快照
          create_time: db.serverDate()
        }
      });

      // --- 第六步：【新增】回填流水ID到快照（双向关联）---
      await transaction.collection('operation_snapshots').doc(snapshotId).update({
        data: { related_log_id: logResult._id }
      });

      // --- 第七步：返回成功结果 ---
      return { success: true, message: '入库成功', snapshotId };
    });
    
  } catch (err) {
    // 捕获事务中的错误并返回给前端
    console.error('入库事务失败:', err);
    return { success: false, message: err.message };
  }
};
