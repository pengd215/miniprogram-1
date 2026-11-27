const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const MAX_QUANTITY = 99
const MAX_CART_ITEMS = 100
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

async function requireCustomer(openid) {
  if (!openid) return null
  const result = await db.collection('employees').where({ _openid: openid }).limit(1).get()
  const customer = result.data[0]
  return customer && customer.role === 'customer' && customer.status !== 'disabled' ? customer : null
}

function validProduct(product) {
  return product && product.status === 'active' && product.deleted !== true
}

function normalizeProduct(product) {
  const price = Number(product.price)
  const images = Array.isArray(product.images) ? product.images.filter(value => typeof value === 'string' && value.trim()) : []
  const sourceOe = Array.isArray(product.oe_list) && product.oe_list.length ? product.oe_list : product.oe_no || []
  const oeList = Array.isArray(sourceOe) ? sourceOe.map(String).filter(Boolean) : String(sourceOe).split(/[,，\s]+/).filter(Boolean)
  return {
    _id: product._id,
    car_model: product.car_model || '',
    model_year: product.model_year || '',
    direction: product.direction || '',
    price: Number.isFinite(price) ? price : 0,
    kyb_no: product.kyb_no || '',
    oeList,
    images
  }
}

function validQuantity(value) {
  const quantity = Number(value)
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= MAX_QUANTITY ? quantity : null
}

async function getProduct(productId) {
  if (!productId || typeof productId !== 'string') return null
  const products = db.collection('products')
  const queryResult = await products.where({ _id: productId }).limit(1).field(PRODUCT_FIELDS).get()
  if (queryResult.data && queryResult.data.length) return queryResult.data[0]

  // Keep direct document lookup as a fallback for older CloudBase collection behavior.
  try {
    const result = await products.doc(productId).field(PRODUCT_FIELDS).get()
    return result.data || null
  } catch (error) {
    if (error && error.errCode === -502005) return null
    throw error
  }
}

async function setWithCollectionInit(collectionName, documentRef, data) {
  try {
    return await documentRef.set({ data })
  } catch (error) {
    if (!error || error.errCode !== -502005) throw error

    // CloudBase does not create collections on document writes. Create once on first use,
    // then retry in case another request initialized it concurrently.
    try {
      await db.createCollection(collectionName)
    } catch (createError) {
      console.info(`[cartManage] 集合 ${collectionName} 已存在或并发创建`, createError && createError.errCode)
    }
    return documentRef.set({ data })
  }
}

function isMissingCollection(error) {
  return Boolean(error && (
    String(error.errCode) === '-502005' ||
    /collection.*not exist|collection.*not found/i.test(error.message || '')
  ))
}

async function ensureCollection(collectionName) {
  try {
    await db.collection(collectionName).limit(1).get()
    return
  } catch (error) {
    if (!isMissingCollection(error)) throw error
  }

  try {
    await db.createCollection(collectionName)
  } catch (createError) {
    // Another request may create the collection at the same time; verify below.
    console.info(`[cartManage] 创建集合 ${collectionName} 返回:`, createError && createError.errCode)
  }
  await db.collection(collectionName).limit(1).get()
}

exports.main = async function (event) {
  event = event || {}
  const { OPENID } = cloud.getWXContext()
  let stage = '客户身份校验'
  try {
    const customer = await requireCustomer(OPENID)
    if (!customer) return { success: false, code: 403, message: '当前账号无权使用购物车' }

    const action = String(event.action || '')
    stage = `购物车${action || '未知操作'}`
    const cart = db.collection('carts')
    const ownedRows = () => cart.where({ _openid: OPENID })

    if (action === 'count') {
      let result
      try {
        result = await ownedRows().limit(MAX_CART_ITEMS).get()
      } catch (error) {
        if (error && error.errCode === -502005) return { success: true, count: 0 }
        throw error
      }
      return { success: true, count: result.data.filter(row => !row.order_id).length }
    }

    if (action === 'list') {
      let result
      try {
        result = await ownedRows().orderBy('update_time', 'desc').limit(MAX_CART_ITEMS).get()
      } catch (error) {
        if (error && error.errCode === -502005) return { success: true, items: [], count: 0 }
        throw error
      }
      const activeRows = result.data.filter(row => !row.order_id)
      const items = await Promise.all(activeRows.map(async row => {
        let product = null
        try { product = await getProduct(row.product_id) } catch (error) { /* missing product remains visible as unavailable */ }
        const current = validProduct(product) ? normalizeProduct(product) : null
        return {
          _id: row._id,
          product_id: row.product_id,
          quantity: row.quantity,
          selected: row.selected !== false,
          snapshot: row.display_snapshot || {},
          product: current,
          available: Boolean(current),
          priceChanged: Boolean(current && Number(row.display_snapshot && row.display_snapshot.price) !== current.price)
        }
      }))
      return { success: true, items }
    }

    if (action === 'add') {
      const productId = String(event.productId || '').trim()
      const quantity = validQuantity(event.quantity === undefined ? 1 : event.quantity)
      const requestId = String(event.requestId || '').trim()
      if (!productId || productId.length > 128 || !quantity || !requestId || requestId.length > 100) {
        return { success: false, code: 400, message: '加购参数无效' }
      }
      let product = null
      stage = '加购：读取商品'
      try {
        product = await getProduct(productId)
      } catch (error) {
        console.error('[cartManage] 加购读取商品失败:', { productId, errCode: error && error.errCode, message: error && error.message })
        throw error
      }
      if (!validProduct(product)) {
        console.warn('[cartManage] 加购商品未找到或不可售:', { productId, found: Boolean(product), status: product && product.status })
        return { success: false, code: 409, message: '商品已下架或商品编号无效，请刷新商品列表后重试' }
      }
      const normalized = normalizeProduct(product)
      const rowId = digest(`${OPENID}:${productId}`)
      const requestDocId = digest(`${OPENID}:${requestId}`)
      // Collection reads do not create collections; initialize both before checking ids.
      await ensureCollection('carts')
      await ensureCollection('cartRequests')

      const requestRef = db.collection('cartRequests').doc(requestDocId)
      stage = '加购：检查请求幂等记录'
      const requestRows = await db.collection('cartRequests').where({ _id: requestDocId }).limit(1).get()
      if (requestRows.data.length) {
        stage = '加购：读取购物车计数'
        const rows = await ownedRows().limit(MAX_CART_ITEMS).get()
        return { success: true, count: rows.data.filter(row => !row.order_id).length, deduplicated: true }
      }

      const rowRef = cart.doc(rowId)
      stage = '加购：读取已有购物车商品'
      const existingRows = await cart.where({ _id: rowId, _openid: OPENID }).limit(1).get()
      const existing = existingRows.data[0] || null
      const nextQuantity = Math.min((existing ? Number(existing.quantity) || 0 : 0) + quantity, MAX_QUANTITY)
      const now = db.serverDate()
      const row = {
        _openid: OPENID,
        customer_id: customer._id,
        product_id: productId,
        quantity: nextQuantity,
        selected: existing ? existing.selected !== false : true,
        display_snapshot: normalized,
        update_time: now
      }
      if (existing) {
        stage = '加购：更新购物车记录'
        await rowRef.update({ data: { ...row, order_id: _.remove() } })
      } else {
        stage = '加购：创建购物车记录'
        await setWithCollectionInit('carts', rowRef, { ...row, create_time: now })
      }
      stage = '加购：保存请求幂等记录'
      await setWithCollectionInit('cartRequests', requestRef, { _openid: OPENID, product_id: productId, create_time: now })
      stage = '加购：读取购物车计数'
      const rows = await ownedRows().limit(MAX_CART_ITEMS).get()
      return { success: true, count: rows.data.filter(item => !item.order_id).length, quantity: Math.min(quantity, MAX_QUANTITY) }
    }

    const rowId = String(event.cartId || '').trim()
    if (!rowId || rowId.length > 128) return { success: false, code: 400, message: '购物车商品无效' }
    const rowRef = cart.doc(rowId)
    const row = (await rowRef.get()).data
    if (!row || row._openid !== OPENID) return { success: false, code: 404, message: '购物车商品不存在' }

    if (action === 'remove') {
      await rowRef.remove()
    } else if (action === 'quantity') {
      const quantity = validQuantity(event.quantity)
      if (!quantity) return { success: false, code: 400, message: `数量须为 1 至 ${MAX_QUANTITY} 的整数` }
      await rowRef.update({ data: { quantity, update_time: db.serverDate() } })
    } else if (action === 'select') {
      if (typeof event.selected !== 'boolean') return { success: false, code: 400, message: '选中状态无效' }
      await rowRef.update({ data: { selected: event.selected, update_time: db.serverDate() } })
    } else {
      return { success: false, code: 400, message: '不支持的操作' }
    }

    const rows = await ownedRows().limit(MAX_CART_ITEMS).get()
    return { success: true, count: rows.data.filter(item => !item.order_id).length }
  } catch (error) {
    if (error && error.errCode === -502005) {
      if (event.action === 'list') return { success: true, items: [], count: 0 }
      if (event.action === 'count') return { success: true, count: 0 }
      if (event.action === 'add') {
        console.error('[cartManage] 加购记录不存在:', { stage, productId: event.productId, requestId: event.requestId })
        return { success: false, code: 404, message: `${stage}失败：数据库记录不存在` }
      }
      return { success: false, code: 404, message: '购物车商品不存在或已被移除，请刷新重试' }
    }
    console.error('[cartManage] 操作失败:', { stage, errCode: error && error.errCode, message: error && error.message })
    return { success: false, code: 500, message: `${stage}失败，请稍后重试` }
  }
}
