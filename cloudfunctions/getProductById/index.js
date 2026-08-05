// cloudfunctions/getProductById/index.js
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }); 
const db = cloud.database();

exports.main = async (event, context) => {
  const { id } = event;
  if (!id) return { code: 400, message: '缺少产品ID' };

  try {
    const res = await db.collection('products').doc(id).get();
    if (res.data) {
      return { code: 200, message: '查询成功', data: res.data };
    } else {
      return { code: 404, message: '未找到该配件' };
    }
  } catch (err) {
    return { code: 500, message: '查询失败', err };
  }
};