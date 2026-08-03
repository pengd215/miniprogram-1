// cloudfunctions/submitInbound/index.js
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
  // 兼容前端可能传来的 oeCode 或 oe_no
  const { oe_no, kyb_no, model, quantity, remark } = event;
  
  // 优先取 oe_no，如果没有则取 oeCode
  const targetOe = oe_no || oeCode;

  // 参数校验：将数量转为数字
  const num = parseInt(quantity);
  
  if (!targetOe && !kyb_no) {
    return { success: false, message: '请提供 OE码 或 KYB号' };
  }
  if (isNaN(num) || num <= 0) {
    return { success: false, message: '入库数量必须大于0' };
  }

  try {
    // 开启数据库事务（保证库存更新和流水记录要么同时成功，要么同时失败）
    return await db.runTransaction(async transaction => {
      
      // --- 第一步：查找零件 ---
      // 构建查询条件：只要 OE码匹配 或者 KYB号匹配 都可以
      const queryCondition = {};
      if (targetOe) queryCondition.oe_no = targetOe;
      if (kyb_no) queryCondition.kyb_no = kyb_no;

      const productRes = await transaction.collection('products').where(queryCondition).get();

      // --- 第二步：判断是否存在 ---
      if (productRes.data.length === 0) {
         throw new Error('零件不存在，请先建立档案');
      }

      const product = productRes.data[0];
      const productId = product._id;

      // --- 第三步：更新库存 (原子操作增加库存) ---
      // 【修复点】原代码写的是 _.inc(qty)，但变量名是 num
      await transaction.collection('products').doc(productId).update({
        data: {
          stock: _.inc(num) 
        }
      });

      // --- 第四步：记录流水日志 ---
      await transaction.collection('transaction_logs').add({
        data: {
          product_id: productId,    
          
          // 【修复点】原代码写的是 oe_no，但变量名是 targetOe
          oe_no: product.oe_no || targetOe,   
          kyb_no: product.kyb_no || kyb_no,
          model: product.model || model,
          
          type: 'inbound',          // 类型：入库
          _openid: currentOpenId,  // 记录是谁操作的
          quantity: num,            // 【修复点】统一使用 num
          remark: remark || '无备注', 
          create_time: db.serverDate() // 服务器时间
        }
      });

      // --- 第五步：返回成功结果 ---
      return { success: true, message: '入库成功' };
    });
    
  } catch (err) {
    // 捕获事务中的错误并返回给前端
    console.error('入库事务失败:', err);
    return { success: false, message: err.message };
  }
};