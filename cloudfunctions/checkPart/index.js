const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { keyword } = event

  if (!keyword) return { code: 400, msg: '请输入查询内容' }

  // 优化 彻底清洗数据：去除首尾空格，甚至去除中间空格（防止用户输入 "334 133"）
  const k = keyword.trim().replace(/\s+/g, '') 

  try {
    // 优化 构建查询条件
    const queryCondition = _.or([
      // KYB号：改为模糊匹配，防止数据库有后缀（如 -01）导致搜不到
      { kyb_no: db.RegExp({ regexp: k, options: 'i' }) },
      
      // OE号：模糊匹配
      { oe_no: db.RegExp({ regexp: k, options: 'i' }) },
      
      // 车型/适用车型：模糊匹配
      { car_model: db.RegExp({ regexp: k, options: 'i' }) }, 
    ])

    const res = await db.collection('products')
      .where(queryCondition)
      .orderBy('_id', 'desc') // 按 ID 降序，确保优先拿到最新录入/修改的记录
      .limit(10) // 限制返回数量，防止数据过多
      .get()

    if (res.data.length > 0) {
      // 找到多个结果时，默认返回第一个（或者你可以把整个列表返回给前端做选择）
      const targetItem = res.data[0];
      return { 
        code: 200, 
        data: res.data[0],
        count: res.data.length // 告诉前端找到了几个，如果有多个可以提示用户
      }
    } else {
      return { code: 404, msg: '未找到该配件，请建档' }
    }
  } catch (err) {
    console.error('云函数查询报错:', err)
    return { code: 500, msg: '服务器开小差了: ' + err.message }
  }
}