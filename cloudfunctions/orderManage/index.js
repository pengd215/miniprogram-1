const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

async function requireCustomer(openid) {
  if (!openid) return null
  const result = await db.collection('employees').where({ _openid: openid }).limit(1).get()
  const employee = result.data[0]
  return employee && employee.role === 'customer' && employee.status !== 'disabled' ? employee : null
}

function publicOrder(order) {
  return {
    _id: order._id,
    order_no: order.order_no,
    items: order.items || [],
    total_amount: order.total_amount,
    status: order.status,
    status_label: order.status_label || '待业务员确认',
    contact: order.contact || {},
    remark: order.remark || '',
    inventory_reserved: false,
    create_time: order.create_time
  }
}

exports.main = async function (event) {
  event = event || {}
  const { OPENID } = cloud.getWXContext()
  try {
    if (!await requireCustomer(OPENID)) return { success: false, code: 403, message: '当前账号无权查看订单' }
    const action = String(event.action || 'list')
    const orders = db.collection('orders')
    if (action === 'list') {
      const result = await orders.where({ _openid: OPENID }).orderBy('create_time', 'desc').limit(50).get()
      return { success: true, orders: result.data.map(publicOrder) }
    }
    if (action === 'detail') {
      const orderId = String(event.orderId || '').trim()
      if (!orderId || orderId.length > 128) return { success: false, code: 400, message: '订单编号无效' }
      const result = await orders.where({ _id: orderId, _openid: OPENID }).limit(1).get()
      if (!result.data.length) return { success: false, code: 404, message: '订单不存在' }
      return { success: true, order: publicOrder(result.data[0]) }
    }
    return { success: false, code: 400, message: '不支持的订单查询' }
  } catch (error) {
    console.error('[orderManage] 查询失败:', error)
    return { success: false, code: 500, message: '订单查询失败，请稍后重试' }
  }
}
