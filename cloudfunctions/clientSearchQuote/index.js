// cloudfunctions/clientSearchQuote/index.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const keyword = String((event && event.keyword) || '').trim()
  const { OPENID } = cloud.getWXContext()

  if (!OPENID) return { code: 401, msg: '请先登录后查询' }

  try {
    const customerRes = await db.collection('employees')
      .where({ _openid: OPENID })
      .limit(1)
      .get()
    const customer = customerRes.data[0]
    if (!customer || customer.role !== 'customer' || customer.status === 'disabled') {
      return { code: 403, msg: '当前账号无权查询客户报价' }
    }
  } catch (err) {
    console.error('[clientSearchQuote] 客户身份校验失败:', err)
    return { code: 500, msg: '查询失败' }
  }
  
  // 正则转义工具：防止用户输入注入正则元字符（ReDoS）
  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  if (!keyword) {
    return { code: 400, msg: '请输入查询关键词' }
  }

  try {
    // 1. 构建正则搜索条件 (支持模糊匹配 OE号或名称)
    const searchRegex = new RegExp(escapeRegExp(keyword), 'i')
    // 2. 核心操作：projection (投影)
    const res = await db.collection('products')
      .where(_.and([
        { status: 'active' },
        _.or([
          { oe_no: searchRegex },
          { kyb_no: searchRegex },
          { car_model: searchRegex }
        ])
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

    return {
      code: 200,
      msg: '查询成功',
      data: res.data
    }

  } catch (err) {
    console.error('[clientSearchQuote] 查询失败:', err)
    return { code: 500, msg: '查询失败' }
  }
}
