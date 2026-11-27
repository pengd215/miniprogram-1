const assert = require('assert')
const Module = require('module')

let openid = 'customer-openid'
let employees = [{ _id: 'customer-1', _openid: openid, role: 'customer', status: 'active' }]
let products = []

function project(document, fields) {
  if (!fields) return { ...document }
  return Object.keys(fields).reduce((result, key) => {
    if (fields[key] && document[key] !== undefined) result[key] = document[key]
    return result
  }, {})
}

function createDatabase() {
  return {
    collection(name) {
      if (name === 'employees') {
        let filter = {}
        return {
          where(value) {
            filter = value
            return this
          },
          limit() {
            return this
          },
          async get() {
            return { data: employees.filter(item => item._openid === filter._openid).slice(0, 1) }
          }
        }
      }

      return {
        where(filter) {
          let orderField = ''
          let orderDirection = 'asc'
          let offset = 0
          let limit = products.length
          let fields = null
          const query = {
            orderBy(field, direction) {
              orderField = field
              orderDirection = direction
              return query
            },
            skip(value) {
              offset = value
              return query
            },
            limit(value) {
              limit = value
              return query
            },
            field(value) {
              fields = value
              return query
            },
            async get() {
              let rows = products.filter(item => !filter.status || item.status === filter.status)
              if (orderField) {
                rows = rows.slice().sort((left, right) => {
                  const delta = new Date(left[orderField]).getTime() - new Date(right[orderField]).getTime()
                  return orderDirection === 'desc' ? -delta : delta
                })
              }
              return { data: rows.slice(offset, offset + limit).map(item => project(item, fields)) }
            }
          }
          return query
        },
        doc(id) {
          let fields = null
          return {
            field(value) {
              fields = value
              return this
            },
            async get() {
              const data = products.find(item => item._id === id)
              if (!data) throw new Error('not found')
              return { data: project(data, fields) }
            }
          }
        }
      }
    }
  }
}

const fakeCloud = {
  DYNAMIC_CURRENT_ENV: 'test',
  init() {},
  database: createDatabase,
  getWXContext() {
    return { OPENID: openid }
  }
}

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeCloud
  return originalLoad.call(this, request, parent, isMain)
}
const functionPath = require.resolve('../cloudfunctions/clientListProducts')
delete require.cache[functionPath]
const { main } = require(functionPath)
Module._load = originalLoad

function product(id, options = {}) {
  return {
    _id: id,
    status: 'active',
    update_time: new Date(`2026-01-${String(options.day || 1).padStart(2, '0')}T00:00:00Z`),
    car_model: `车型 ${id}`,
    price: 100,
    images: options.images === undefined ? [`cloud://${id}.jpg`] : options.images,
    stock: 999,
    location: 'secret location',
    ...options
  }
}

async function run() {
  openid = 'customer-openid'
  employees = [{ _id: 'customer-1', _openid: openid, role: 'customer', status: 'active' }]
  products = [
    product('one', { day: 10 }),
    product('no-image', { day: 9, images: [] }),
    product('two', { day: 8 }),
    product('draft', { day: 7, status: 'pending' }),
    ...Array.from({ length: 7 }, (_, index) => product(`item-${index}`, { day: 7 - index }))
  ]

  const first = await main({ action: 'showcase', pageSize: 8 })
  assert.strictEqual(first.success, true)
  assert.strictEqual(first.items.length, 8)
  assert.strictEqual(first.hasMore, true)

  const second = await main({ action: 'showcase', pageSize: 8, offset: first.nextOffset })
  assert.strictEqual(second.success, true)
  const displayedIds = first.items.concat(second.items).map(item => item._id)
  assert.strictEqual(new Set(displayedIds).size, 9)
  assert.ok(!displayedIds.includes('no-image'))
  assert.ok(!displayedIds.includes('draft'))
  assert.ok(first.items.every(item => item.stock === undefined && item.location === undefined))

  const detail = await main({ action: 'detail', productId: 'one' })
  assert.strictEqual(detail.success, true)
  assert.strictEqual(detail.product.stock, undefined)
  assert.strictEqual(detail.product.location, undefined)

  employees = [{ _id: 'worker-1', _openid: openid, role: 'worker', status: 'active' }]
  const denied = await main({ action: 'showcase' })
  assert.strictEqual(denied.success, false)
  assert.strictEqual(denied.code, 403)

  console.log('clientListProducts tests passed')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
})
