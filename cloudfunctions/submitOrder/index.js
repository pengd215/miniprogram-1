const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const MAX_ORDER_ITEMS = 30
const QUOTE_TTL_MS = 15 * 60 * 1000
const PRODUCT_FIELDS = {
  _id: true,
  car_model: true,
  model_year: true,
  direction: true,
  price: true,
  kyb_no: true,
  oe_no: true,
  oe_list: true,
  images: true,
  status: true,
  deleted: true
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function cents(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : 0
}

function normalizeProduct(product) {
  const sourceOe = Array.isArray(product.oe_list) && product.oe_list.length ? product.oe_list : product.oe_no || []
  const oeList = Array.isArray(sourceOe) ? sourceOe.map(value => String(value).trim()).filter(Boolean) : String(sourceOe).split(/[,，\s]+/).filter(Boolean)
  const images = Array.isArray(product.images) ? product.images.filter(value => typeof value === 'string' && value.trim()) : []
  return {
    product_id: product._id,
    car_model: product.car_model || '',
    model_year: product.model_year || '',
    direction: product.direction || '',
    kyb_no: product.kyb_no || '',
    oe_list: oeList,
    image: images[0] || '',
    unit_price_cents: cents(product.price),
    unit_price: cents(product.price) / 100
  }
}

async function requireCustomer(openid) {
  if (!openid) return null
  const result = await db.collection('employees').where({ _openid: openid }).limit(1).get()
  const employee = result.data[0]
  return employee && employee.role === 'customer' && employee.status !== 'disabled' ? employee : null
}

async function ensureCollection(name) {
  try {
    await db.collection(name).limit(1).get()
  } catch (error) {
    if (!error || String(error.errCode) !== '-502005') throw error
    try { await db.createCollection(name) } catch (createError) {
      console.info(`[submitOrder] ${name} collection init:`, createError && createError.errCode)
    }
    await db.collection(name).limit(1).get()
  }
}

async function loadSelectedCart(openid) {
  const result = await db.collection('carts').where({ _openid: openid }).limit(100).get()
  return result.data.filter(row => row.selected !== false && !row.order_id)
}

async function buildQuote(openid, customer, requestId, cartRows, oldQuote) {
  const items = []
  const changes = []
  const normalizedRows = await Promise.all(cartRows.map(async row => {
    if (!Number.isInteger(Number(row.quantity)) || Number(row.quantity) < 1 || Number(row.quantity) > 99) {
      throw new Error('购物车中存在无效数量，请返回购物车调整')
    }
    let result
    try {
      result = await db.collection('products').doc(row.product_id).field(PRODUCT_FIELDS).get()
    } catch (error) {
      if (error && String(error.errCode) === '-502005') throw new Error('有商品档案已删除，请返回购物车检查')
      throw error
    }
    const product = result.data
    if (!product || product.status !== 'active' || product.deleted === true) {
      throw new Error(`${(product && product.car_model) || '购物车商品'}已下架或不可购买，请返回购物车检查`)
    }
    const snapshot = normalizeProduct(product)
    const quantity = Number(row.quantity)
    return { row, snapshot, quantity }
  }))

  for (const { row, snapshot, quantity } of normalizedRows) {
    const previousPrice = cents(row.display_snapshot && row.display_snapshot.price)
    const originalQuoteItem = oldQuote && oldQuote.items.find(item => item.cart_id === row._id)
    const expectedPrice = originalQuoteItem ? originalQuoteItem.unit_price_cents : previousPrice
    if (expectedPrice !== snapshot.unit_price_cents) {
      changes.push({
        cart_id: row._id,
        car_model: snapshot.car_model,
        old_price: expectedPrice / 100,
        new_price: snapshot.unit_price,
        quantity
      })
    }
    items.push({
      cart_id: row._id,
      quantity,
      ...snapshot,
      line_total_cents: snapshot.unit_price_cents * quantity,
      line_total: snapshot.unit_price * quantity
    })
  }
  if (!items.length) throw new Error('请先在购物车勾选要提交的商品')
  if (items.length > MAX_ORDER_ITEMS) throw new Error(`单次最多提交 ${MAX_ORDER_ITEMS} 种商品`)

  const totalCents = items.reduce((sum, item) => sum + item.line_total_cents, 0)
  const quoteId = digest(`${openid}:${requestId}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`)
  const quote = {
    _openid: openid,
    customer_id: customer._id,
    request_id: requestId,
    items,
    total_amount_cents: totalCents,
    expires_at: Date.now() + QUOTE_TTL_MS,
    create_time: db.serverDate()
  }
  await db.collection('orderQuotes').doc(quoteId).set({ data: quote })
  return {
    quoteId,
    items,
    totalAmount: totalCents / 100,
    priceChanges: changes
  }
}

async function finalizeCartRows(order) {
  await Promise.all(order.cart_ids.map(cartId => db.collection('carts').doc(cartId).update({
      data: { order_id: order._id, selected: false, update_time: db.serverDate() }
    })))
}

exports.main = async function (event) {
  event = event || {}
  const { OPENID } = cloud.getWXContext()
  let stage = '客户身份校验'
  try {
    const customer = await requireCustomer(OPENID)
    if (!customer) return { success: false, code: 403, message: '当前账号无权提交订单' }
    const action = String(event.action || '')
    await ensureCollection('carts')
    await ensureCollection('orders')
    await ensureCollection('orderQuotes')

    if (action === 'prepare') {
      const requestId = String(event.requestId || '').trim()
      if (!requestId || requestId.length > 100) return { success: false, code: 400, message: '下单请求无效，请重新进入确认页' }
      const cartRows = await loadSelectedCart(OPENID)
      if (!cartRows.length) return { success: false, code: 400, message: '请先在购物车勾选要提交的商品' }
      if (cartRows.length > MAX_ORDER_ITEMS) return { success: false, code: 400, message: `单次最多提交 ${MAX_ORDER_ITEMS} 种商品` }
      stage = '生成服务端报价'
      let quote
      try { quote = await buildQuote(OPENID, customer, requestId, cartRows) } catch (error) {
        return { success: false, code: 409, message: error.message }
      }
      return { success: true, ...quote }
    }

    if (action !== 'submit') return { success: false, code: 400, message: '不支持的订单操作' }
    const requestId = String(event.requestId || '').trim()
    const quoteId = String(event.quoteId || '').trim()
    const contactName = String(event.contactName || '').trim()
    const contactPhone = String(event.contactPhone || '').trim()
    const remark = String(event.remark || '').trim()
    if (!requestId || requestId.length > 100 || !quoteId || quoteId.length > 128) return { success: false, code: 400, message: '报价已失效，请返回确认页刷新' }
    if (contactName.length < 2 || contactName.length > 30) return { success: false, code: 400, message: '请填写 2 至 30 个字的联系人姓名' }
    if (!/^[0-9+()\-\s]{6,24}$/.test(contactPhone)) return { success: false, code: 400, message: '请填写有效联系电话' }
    if (remark.length > 300) return { success: false, code: 400, message: '备注不能超过 300 个字' }

    const orderId = digest(`${OPENID}:${requestId}`)
    const orders = db.collection('orders')
    const existingOrders = await orders.where({ _id: orderId, _openid: OPENID }).limit(1).get()
    if (existingOrders.data.length) {
      stage = '恢复已提交订单购物车状态'
      await finalizeCartRows(existingOrders.data[0])
      return { success: true, order: { _id: existingOrders.data[0]._id, order_no: existingOrders.data[0].order_no, total_amount: existingOrders.data[0].total_amount } }
    }

    const quoteRows = await db.collection('orderQuotes').where({ _id: quoteId, _openid: OPENID, request_id: requestId }).limit(1).get()
    const quote = quoteRows.data[0]
    if (!quote || quote.expires_at < Date.now()) return { success: false, code: 409, message: '报价已过期，请刷新报价后确认' }

    stage = '复核当前商品和价格'
    const currentRows = await loadSelectedCart(OPENID)
    const quotedCartIds = quote.items.map(item => item.cart_id).sort()
    const currentCartIds = currentRows.map(item => item._id).sort()
    if (JSON.stringify(quotedCartIds) !== JSON.stringify(currentCartIds)) {
      return { success: false, code: 409, message: '购物车内容已变化，请返回确认页重新核对' }
    }
    let refreshed
    try { refreshed = await buildQuote(OPENID, customer, requestId, currentRows, quote) } catch (error) {
      return { success: false, code: 409, message: error.message }
    }
    if (refreshed.priceChanges.length) {
      return { success: false, code: 409, needsPriceConfirm: true, message: '商品报价发生变化，请确认最新报价', ...refreshed }
    }

    const orderNo = `ZL${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}${orderId.slice(0, 6).toUpperCase()}`
    const orderItems = refreshed.items.map(item => ({
      product_id: item.product_id,
      car_model: item.car_model,
      model_year: item.model_year,
      direction: item.direction,
      kyb_no: item.kyb_no,
      oe_list: item.oe_list,
      image: item.image,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: item.line_total_cents / 100
    }))
    const order = {
      _openid: OPENID,
      customer_id: customer._id,
      customer_name: customer.name || '',
      request_id: requestId,
      order_no: orderNo,
      cart_ids: refreshed.items.map(item => item.cart_id),
      items: orderItems,
      total_amount: refreshed.totalAmount,
      total_amount_cents: Math.round(refreshed.totalAmount * 100),
      status: 'submitted',
      status_label: '待业务员确认',
      contact: { name: contactName, phone: contactPhone },
      remark,
      inventory_reserved: false,
      create_time: db.serverDate(),
      update_time: db.serverDate()
    }
    stage = '创建订单记录'
    await orders.doc(orderId).set({ data: order })
    stage = '标记已提交购物车商品'
    await finalizeCartRows({ ...order, _id: orderId })
    return { success: true, order: { _id: orderId, order_no: orderNo, total_amount: order.total_amount } }
  } catch (error) {
    console.error('[submitOrder] 订单处理失败:', { stage, errCode: error && error.errCode, message: error && error.message })
    return { success: false, code: 500, message: `${stage}失败，请稍后重试` }
  }
}
