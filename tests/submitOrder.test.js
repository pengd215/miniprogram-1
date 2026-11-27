const assert = require('assert')
const Module = require('module')

const openid = 'customer-openid'
const collections = new Map()
collections.set('employees', new Map([['customer-1', { _id: 'customer-1', _openid: openid, role: 'customer', status: 'active', name: '客户甲' }]]))
collections.set('products', new Map([['zero-stock', {
  _id: 'zero-stock', status: 'active', stock: 0, price: 125.5,
  car_model: '测试车型', model_year: '2020-2024', direction: '前',
  images: ['cloud://test.jpg'], oe_no: 'OE-1'
}]]))
collections.set('carts', new Map([['cart-row-1', {
  _id: 'cart-row-1', _openid: openid, customer_id: 'customer-1', product_id: 'zero-stock',
  quantity: 2, selected: true, display_snapshot: { price: 125.5, car_model: '测试车型' }
}]]))

function missingCollection() {
  const error = new Error('database collection not exists')
  error.errCode = -502005
  return error
}

const db = {
  collection(name) {
    const getRows = () => {
      const rows = collections.get(name)
      if (!rows) throw missingCollection()
      return rows
    }
    return {
      limit(value) {
        return { async get() { return { data: Array.from(getRows().values()).slice(0, value) } } }
      },
      where(filter) {
        let max = Infinity
        let sortField = ''
        let sortDirection = 'asc'
        const query = {
          limit(value) { max = value; return query },
          orderBy(field, direction) { sortField = field; sortDirection = direction; return query },
          field() { return query },
          async get() {
            let rows = Array.from(getRows().values()).filter(row => Object.keys(filter).every(key => row[key] === filter[key]))
            if (sortField) rows.sort((a, b) => (a[sortField] > b[sortField] ? 1 : -1) * (sortDirection === 'desc' ? -1 : 1))
            return { data: rows.slice(0, max) }
          }
        }
        return query
      },
      doc(id) {
        return {
          field() { return this },
          async get() {
            const row = getRows().get(id)
            if (!row) throw missingCollection()
            return { data: { ...row } }
          },
          async set({ data }) { getRows().set(id, { _id: id, ...data }) },
          async update({ data }) { getRows().set(id, { ...getRows().get(id), ...data }) }
        }
      }
    }
  },
  serverDate: () => new Date(),
  async createCollection(name) { collections.set(name, new Map()) }
}

const fakeCloud = { DYNAMIC_CURRENT_ENV: 'test', init() {}, database: () => db, getWXContext: () => ({ OPENID: openid }) }
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeCloud
  return originalLoad.call(this, request, parent, isMain)
}
const functionPath = require.resolve('../cloudfunctions/submitOrder')
delete require.cache[functionPath]
const { main } = require(functionPath)
Module._load = originalLoad

async function run() {
  const prepared = await main({ action: 'prepare', requestId: 'request-1' })
  assert.strictEqual(prepared.success, true)
  assert.strictEqual(prepared.totalAmount, 251)
  assert.strictEqual(prepared.priceChanges.length, 0)
  assert.strictEqual(prepared.items[0].unit_price, 125.5)

  collections.get('products').get('zero-stock').price = 130
  const changedPrice = await main({
    action: 'submit', requestId: 'request-1', quoteId: prepared.quoteId,
    contactName: '客户甲', contactPhone: '13800138000',
    totalAmount: 0, unitPrice: 0, _openid: 'forged-openid', status: 'completed'
  })
  assert.strictEqual(changedPrice.success, false)
  assert.strictEqual(changedPrice.needsPriceConfirm, true)
  assert.strictEqual(changedPrice.totalAmount, 260)
  assert.strictEqual(collections.get('orders').size, 0)

  const submitted = await main({
    action: 'submit', requestId: 'request-1', quoteId: changedPrice.quoteId,
    contactName: '客户甲', contactPhone: '13800138000',
    totalAmount: 0, unitPrice: 0, _openid: 'forged-openid', status: 'completed'
  })
  assert.strictEqual(submitted.success, true)
  const order = collections.get('orders').get(submitted.order._id)
  assert.strictEqual(order.total_amount, 260)
  assert.strictEqual(order.status, 'submitted')
  assert.strictEqual(order.inventory_reserved, false)
  assert.strictEqual(order._openid, openid)
  assert.strictEqual(order.items[0].unit_price, 130)
  assert.strictEqual(collections.get('carts').get('cart-row-1').order_id, order._id)

  const repeated = await main({ action: 'submit', requestId: 'request-1', quoteId: changedPrice.quoteId, contactName: '客户甲', contactPhone: '13800138000' })
  assert.strictEqual(repeated.success, true)
  assert.strictEqual(repeated.order._id, submitted.order._id)
  assert.strictEqual(collections.get('orders').size, 1)

  const emptyPrepare = await main({ action: 'prepare', requestId: 'request-2' })
  assert.strictEqual(emptyPrepare.success, false)
  assert.strictEqual(emptyPrepare.code, 400)

  console.log('submitOrder tests passed')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
