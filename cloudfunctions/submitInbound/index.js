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
    // 开启数据库事务（保证库存更新和流水记录要么同时成功，要么同时失败）
    return await db.runTransaction(async transaction => {
      
      // --- 第一步：查找零件 ---
      // 构建查询条件：只要 OE码匹配 或者 KYB号匹配 都可以
      const productDoc = await transaction.collection('products').doc(productId).get();

      // --- 第二步：判断是否存在 ---
      if (!productDoc.data) {
         throw new Error('产品不存在，请检查ID有效性');
      }
      const product = productDoc.data;

      // --- 第三步：更新库存 (兼容字符串/数字类型) ---
      // 1. 获取数据库中原有的 stock，强制转为数字（如果是 NaN 则默认为 0）
      const oldStock = Number(productDoc.data.stock);
      const safeOldStock = isNaN(oldStock) ? 0 : oldStock;
      
      // 2. 计算新库存
      const newStock = safeOldStock + num;

      // 3. 使用新值直接覆盖写入（绕过 _.inc 的类型限制，并顺带把数据库里的脏数据修正为数字）
      await transaction.collection('products').doc(productId).update({
        data: {
          stock: newStock 
        }
      });

      // --- 第四步：记录流水日志 ---
      await transaction.collection('transaction_logs').add({
        data: {
          product_id: productId,    
          oe_no: product.oe_no || '',   
          kyb_no: product.kyb_no || '',
          model: product.model || '', // 只取数据库字段，不信任前端传入
          type: 'inbound',          // 类型：入库
          _openid: currentOpenId,  // 记录是谁操作的
          quantity: num,            // 统一使用 num
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