const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 转义用户输入里的正则特殊字符，防止正则注入
const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// 读取全局预警配置，缺失时用默认值（低库存 10 / 积压 100）
async function loadGlobalWarning() {
  try {
    const res = await db.collection('settings').doc('warning').get()
    const d = res.data || {}
    return { lowStock: d.lowStock || 10, maxStock: d.maxStock || 100 }
  } catch (e) {
    return { lowStock: 10, maxStock: 100 }
  }
}

// 服务端计算单品库存状态：单品自定义预警值优先，其次全局阈值
// 返回 'out' | 'low' | 'normal'
function getStockStatus(count, item, globalLow) {
  const warnStock = (item && item.warnStock) || globalLow
  if (count <= 0) return 'out'
  if (count < warnStock) return 'low'
  return 'normal'
}

// 分批取回符合条件的全部文档（每批 100 条，供服务端精确筛选用）
async function fetchAll(where) {
  const all = []
  let skip = 0
  for (;;) {
    let q = db.collection('products')
    if (where) q = q.where(where)
    const res = await q.orderBy('stock', 'asc').skip(skip).limit(100).get()
    all.push(...res.data)
    if (res.data.length < 100) break
    skip += 100
    if (all.length > 5000) break // 安全上限，防止异常数据量拖垮云函数
  }
  return all
}

exports.main = async (event, context) => {
  const { keyword = '', status = '', page = 1, pageSize = 20 } = event

  try {
    const global = await loadGlobalWarning()

    // 组装基础查询条件
    const conditions = []
    const k = keyword && keyword.trim()
    if (k) {
      const safeK = escapeRegExp(k)
      conditions.push(_.or([
        { kyb_no: db.RegExp({ regexp: safeK, options: 'i' }) },
        { car_model: db.RegExp({ regexp: safeK, options: 'i' }) }
      ]))
    }
    // 缺货可在数据库直接筛；紧张先粗筛"库存大于0"，再服务端精确判断
    if (status === 'out') conditions.push({ stock: _.lte(0) })
    else if (status === 'low') conditions.push({ stock: _.gt(0) })

    const where = conditions.length === 1
      ? conditions[0]
      : (conditions.length > 1 ? _.and(conditions) : null)

    let paged = []
    let hasMore = false

    if (status === 'low' || status === 'normal') {
      // 状态依赖每个产品自己的预警值，数据库没法直接筛，
      // 在服务端取回后逐个精确计算，再切片出当前页
      const all = await fetchAll(where)
      const filtered = all.filter(item => {
        const raw = (item.stock === undefined || item.stock === null) ? 0 : item.stock
        return getStockStatus(Number(raw), item, global.lowStock) === status
      })
      const start = (page - 1) * pageSize
      paged = filtered.slice(start, start + pageSize)
      hasMore = start + pageSize < filtered.length
    } else {
      // 全部 / 缺货：数据库直接排序分页
      let q = db.collection('products')
      if (where) q = q.where(where)
      const res = await q.orderBy('stock', 'asc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get()
      paged = res.data
      hasMore = paged.length === pageSize
    }

    const statusMap = {
      out: { cls: 'status-out', txt: '缺货' },
      low: { cls: 'status-low', txt: '紧张' },
      normal: { cls: 'status-normal', txt: '充足' }
    }
    const list = paged.map(item => {
      const raw = (item.stock === undefined || item.stock === null) ? 0 : item.stock
      const count = Number(raw)
      const st = statusMap[getStockStatus(count, item, global.lowStock)]
      return {
        _id: item._id,
        kyb_no: item.kyb_no,
        car_model: item.car_model,
        stockCount: count,
        images: item.images,
        statusClass: st.cls,
        statusText: st.txt
      }
    })

    return { success: true, list, hasMore }
  } catch (err) {
    console.error('listProducts 查询失败:', err)
    return { success: false, message: '查询失败' }
  }
}
