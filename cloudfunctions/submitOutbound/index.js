// cloudfunctions/submitOutbound/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }); 
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  
  // 1. 接收参数
  const { productId, quantity, remark } = event;
  // 将数量转为数字，防止计算错误
  const qty = parseInt(quantity);

  // --- 基础校验 ---
  if (!productId) {
    return { success: false, message: '产品ID缺失，无法出库' };
  }
  if (isNaN(qty) || qty <= 0) {
    return { success: false, message: '出库数量必须大于0' };
  }

  try {
    // 开启事务：保证“扣库存”和“记流水”原子性操作
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

      // --- 步骤 C: 扣减库存 (更新 products 表) ---
      // 使用 _.inc(-qty) 进行原子扣减
      await transaction.collection('products').doc(productId).update({
        data: {
          stock: _.inc(-qty) 
        }
      });

      // --- 步骤 D: 记录流水 (写入 transaction_logs 表) ---
      await transaction.collection('transaction_logs').add({
        data: {
          product_id: productId, 
          // 冗余存储 OE码 和 KYB号，方便以后搜索流水
          oe_no: product.oe_no ||'',
          kyb_no: product.kyb_no ||'', 
          quantity: -qty, // 出库记为负数，方便统计总账
          type: 'outbound',
          _openid: wxContext.OPENID, // 记录操作人
          remark: remark || '暂无备注',
          create_time: db.serverDate() // 使用服务器时间
        }
      });
    });

    return { success: true, message: '出库成功' };

  } catch (err) {
    console.error('出库事务失败:', err);
    return { success: false, message: err.message || '出库失败' };
  }
};