const assert = require('assert')
const Module = require('module')

const openid = 'customer-openid'
const collections = new Map()
const employees = [{ _id: 'customer-1', _openid: openid, role: 'customer', status: 'active' }]
const products = [{
  _id: 'zero-stock-product',
  status: 'active',
  stock: 0,
  car_model: '测试车型',
  price: 120,
  images: ['cloud://product.jpg']
}]

function missingCollectionError() {
  const error = new Error('database collection not exists')
  error.errCode = -502005
  return error
}

function collection(name) {
  function getRows() {
    if (name === 'products') return new Map(products.map(item => [item._id, item]))
    if (name === 'employees') return new Map(employees.map(item => [item._id, item]))
    if (!collections.has(name)) throw missingCollectionError()
    return collections.get(name)
  }

  return {
    limit(value) {
      return {
        async get() { return { data: Array.from(getRows().values()).slice(0, value) } }
      }
    },
    where(filter) {
      let max = Infinity
      const query = {
        limit(value) { max = value; return query },
        orderBy() { return query },
        field() { return query },
        async count() {
          const rows = getRows()
          return { total: Array.from(rows.values()).filter(row => Object.keys(filter).every(key => row[key] === filter[key])).length }
        },
        async get() {
          const rows = getRows()
          return { data: Array.from(rows.values()).filter(row => Object.keys(filter).every(key => row[key] === filter[key])).slice(0, max) }
        }
      }
      return query
    },
    doc(id) {
      return {
        field() { return this },
        async get() {
          if (name === 'products') {
            const product = products.find(item => item._id === id)
            if (!product) throw missingCollectionError()
            return { data: { ...product } }
          }
          const rows = getRows()
          const data = rows.get(id)
          if (!data) throw missingCollectionError()
          return { data: { ...data } }
        },
        async set({ data }) {
          const rows = getRows()
          rows.set(id, { _id: id, ...data })
        },
        async update({ data }) {
          const rows = getRows()
          rows.set(id, { ...rows.get(id), ...data })
        }
      }
    }
  }
}

const fakeDb = {
  collection,
  serverDate: () => new Date(),
  async createCollection(name) {
    if (collections.has(name)) {
      const error = new Error('collection already exists')
      error.errCode = -502003
      throw error
    }
    collections.set(name, new Map())
  }
}

const fakeCloud = {
  DYNAMIC_CURRENT_ENV: 'test',
  init() {},
  database: () => fakeDb,
  getWXContext: () => ({ OPENID: openid })
}

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeCloud
  return originalLoad.call(this, request, parent, isMain)
}
const functionPath = require.resolve('../cloudfunctions/cartManage')
delete require.cache[functionPath]
const { main } = require(functionPath)
Module._load = originalLoad

async function run() {
  const first = await main({ action: 'add', productId: 'zero-stock-product', quantity: 1, requestId: 'request-1' })
  assert.strictEqual(first.success, true)
  assert.strictEqual(first.count, 1)
  assert.strictEqual(collections.get('carts').size, 1)
  assert.strictEqual(collections.has('cartRequests'), true)

  const duplicate = await main({ action: 'add', productId: 'zero-stock-product', quantity: 1, requestId: 'request-1' })
  assert.strictEqual(duplicate.success, true)
  assert.strictEqual(duplicate.deduplicated, true)
  assert.strictEqual(Array.from(collections.get('carts').values())[0].quantity, 1)

  const cart = await main({ action: 'list' })
  assert.strictEqual(cart.success, true)
  assert.strictEqual(cart.items.length, 1)
  assert.strictEqual(cart.items[0].available, true)
  assert.strictEqual(cart.items[0].product.stock, undefined)

  console.log('cartManage tests passed')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
