const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const BATCH_SIZE = 80
const MAX_BATCHES_PER_REQUEST = 5
const MAX_OFFSET = 10000
const SHOWCASE_FIELDS = {
  _id: true,
  car_model: true,
  model_year: true,
  direction: true,
  price: true,
  oe_no: true,
  oe_list: true,
  images: true,
  update_time: true,
  status: true,
  deleted: true
}

async function requireCustomer(openid) {
  if (!openid) return null
  const result = await db.collection('employees')
    .where({ _openid: openid })
    .limit(1)
    .get()
  const employee = result.data[0]
  if (!employee || employee.role !== 'customer' || employee.status === 'disabled') return null
  return employee
}

function normalizeProduct(product) {
  const images = Array.isArray(product.images)
    ? product.images.filter(image => typeof image === 'string' && image.trim())
    : []
  const rawOe = Array.isArray(product.oe_list) && product.oe_list.length
    ? product.oe_list
    : (product.oe_no || [])
  const oeList = Array.isArray(rawOe)
    ? rawOe.map(value => String(value).trim()).filter(Boolean)
    : String(rawOe).split(/[,，\s]+/).filter(Boolean)

  return {
    _id: product._id,
    car_model: product.car_model || '',
    model_year: product.model_year || '',
    direction: product.direction || '',
    price: Number.isFinite(Number(product.price)) ? Number(product.price) : 0,
    oeList,
    images
  }
}

function isSellable(product) {
  return product.status === 'active' && product.deleted !== true
}

exports.main = async function (event) {
  event = event || {}
  const { OPENID } = cloud.getWXContext()
  const action = event.action

  try {
    const customer = await requireCustomer(OPENID)
    if (!customer) return { success: false, code: 403, message: '当前账号无权查看商品' }

    if (action === 'detail') {
      const productId = String(event.productId || '').trim()
      if (!productId) return { success: false, code: 400, message: '缺少商品编号' }

      const result = await db.collection('products').doc(productId)
        .field(SHOWCASE_FIELDS)
        .get()
      if (!result.data || !isSellable(result.data)) {
        return { success: false, code: 404, message: '商品已下架或不存在' }
      }

      return { success: true, product: normalizeProduct(result.data) }
    }

    if (action !== 'showcase') {
      return { success: false, code: 400, message: '不支持的查询类型' }
    }

    const requestedSize = Number.parseInt(event.pageSize, 10)
    const pageSize = Math.min(Math.max(requestedSize || 8, 1), 8)
    let offset = Number.parseInt(event.offset, 10) || 0
    offset = Math.min(Math.max(offset, 0), MAX_OFFSET)
    const items = []
    let hasMore = false
    let batchesRead = 0

    while (items.length < pageSize && offset < MAX_OFFSET && batchesRead < MAX_BATCHES_PER_REQUEST) {
      const batchOffset = offset
      const result = await db.collection('products')
        .where({ status: 'active' })
        .orderBy('update_time', 'desc')
        .skip(offset)
        .limit(BATCH_SIZE)
        .field(SHOWCASE_FIELDS)
        .get()

      offset += result.data.length
      batchesRead += 1
      const sellableWithImages = result.data
        .filter(product => isSellable(product) && Array.isArray(product.images) && product.images.some(image => typeof image === 'string' && image.trim()))
        .map(normalizeProduct)

      const remaining = pageSize - items.length
      const selected = sellableWithImages.slice(0, remaining)
      items.push(...selected)
      hasMore = result.data.length === BATCH_SIZE

      if (selected.length && items.length === pageSize) {
        const lastSelectedId = selected[selected.length - 1]._id
        const lastSelectedIndex = result.data.findIndex(product => product._id === lastSelectedId)
        offset = batchOffset + lastSelectedIndex + 1
        hasMore = hasMore || lastSelectedIndex + 1 < result.data.length
        break
      }
      if (!hasMore) break
    }

    return { success: true, items, nextOffset: offset, hasMore }
  } catch (err) {
    if (err && err.errCode === -502005) {
      return { success: false, code: 404, message: '商品已下架或不存在' }
    }
    console.error('[clientListProducts] 查询失败:', err)
    return { success: false, code: 500, message: '商品查询失败' }
  }
}
