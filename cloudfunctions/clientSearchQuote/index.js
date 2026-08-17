// cloudfunctions/clientSearchQuote/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { keyword } = event
// 加日志：查看前端传了什么参数
  console.log('[clientSearchQuote] 收到请求, keyword:', keyword)
  
  // 正则转义工具：防止用户输入注入正则元字符（ReDoS）
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  if (!keyword|| keyword.trim() === '') {
    return { code: 400, msg: '请输入查询关键词' }
  }

  try {
    // 1. 构建正则搜索条件 (支持模糊匹配 OE号或名称)
    const searchRegex = new RegExp(escapeRegExp(keyword.trim()), 'i') 
    

     // 加日志：查看构建的查询条件
     console.log('[clientSearchQuote] 查询条件:', keyword)
    // 2. 核心操作：projection (投影)
    // 第二个参数传入对象，1表示显示，0表示隐藏。
    const res = await db.collection('products')
      .where(_.or([
        { oe_no: searchRegex },
        { kyb_no: searchRegex },
        { car_model: searchRegex }
      ]))
      .limit(20) // 限制返回数量，防止被恶意刷爆
      .field({
        _id: true,
        kyb_no: true,     
        oe_no: true,     
        oe_list:true,
        model_year:true,      
        price: true,      
        images: true,    
        car_model: true,  
        direction:true
      })
      .get()

      // 加日志：查看查到了多少条
    console.log('[clientSearchQuote] 查询结果数量:', res.data.length)

    return {
      code: 200,
      msg: '查询成功',
      data: res.data
    }

  } catch (err) {
    console.error(err)
    return { code: 500, msg: '查询失败' }
  }
}