// cloudfunctions/submitOutbound/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }); 
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  
  // 1. 接收参数
  // 兼容前端可能传来的 oeCode 或 oe_no
  const { oeCode, oe_no, kyb_no, quantity, remark } = event;
  
  // 优先取 oe_no，如果没有则取 oeCode
  const targetOe = oe_no || oeCode; 

  // 将数量转为数字，防止计算错误
  const qty = parseInt(quantity);

  // --- 基础校验 ---
  if (!targetOe && !kyb_no) {
    return { success: false, message: '请提供 OE码 或 KYB号' };
  }
  if (isNaN(qty) || qty <= 0) {
    return { success: false, message: '出库数量必须大于0' };
  }

  try {
    // 开启事务：保证“扣库存”和“记流水”原子性操作
    await db.runTransaction(async transaction => {
      
      // --- 步骤 A: 查找该零件的库存信息 ---
      // 构建查询条件：只要 OE码匹配 或者 KYB号匹配 都可以
      // 注意：这里假设数据库字段名为 oe_no 和 kyb_no
      const queryCondition = {};
      if (targetOe) queryCondition.oe_no = targetOe;
      if (kyb_no) queryCondition.kyb_no = kyb_no;

      const productRes = await transaction.collection('products').where(queryCondition).get();

      if (productRes.data.length === 0) {
        throw new Error(`未找到 OE:${targetOe} 或 KYB:${kyb_no} 的零件信息`);
      }

      const product = productRes.data[0];
      
      // 获取当前库存，如果数据库没这个字段默认为0
      const currentStock = product.stock || 0; 

      // --- 步骤 B: 校验库存是否充足 ---
      if (currentStock < qty) {
        throw new Error(`库存不足！当前库存: ${currentStock}，申请出库: ${qty}`);
      }

      // --- 步骤 C: 扣减库存 (更新 products 表) ---
      // 使用 _.inc(-qty) 进行原子扣减
      await transaction.collection('products').doc(product._id).update({
        data: {
          stock: _.inc(-qty) 
        }
      });

      // --- 步骤 D: 记录流水 (写入 transaction_logs 表) ---
      await transaction.collection('transaction_logs').add({
        data: {
          // 【修复点】这里之前写的是 productId，但变量名其实是 product._id
          product_id: product._id, 
          
          // 冗余存储 OE码 和 KYB号，方便以后搜索流水
          oe_no: product.oe_no || targetOe,
          kyb_no: product.kyb_no || kyb_no,
          
          quantity: -qty, // 出库记为负数，方便统计总账
          type: 'outbound',
          _openid: wxContext.OPENID, // 记录操作人
          remark: remark || '无备注',
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