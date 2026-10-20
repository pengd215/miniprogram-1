/**
 * cloudfunctions/httpQueryPart/index.js
 * ------------------------------------------------------------------
 * 逐鹿减振器库存管理系统 · 只读 HTTP 查询接口（带访问白名单）
 *
 * 只读保证：本文件只调用 db.collection('products').get()（读操作），
 *           不含任何 add / update / set / remove / 事务写入逻辑。
 *
 * 返回内容：只展示 车型 car_model / 年份 model_year / 位置 direction /
 *           价格 price / 库存数量 stock / 备注 remark 六个字段。
 *           不返回 KYB 号、OE 号、预警值、图片等其它字段。
 *
 * 访问白名单（默认拒绝）：
 *   环境变量 ACCESS_TOKENS —— 多个令牌用英文逗号分隔，一人一个，可单独吊销。
 *   例：ACCESS_TOKENS = "zhang-8f3k2m,li-92kd1p,admin-7hq4wz"
 *   请求必须带 token 参数且命中白名单，否则返回 403。
 *   未配置 ACCESS_TOKENS 时接口一律拒绝（fail closed），其他人即使拿到网址也调不到。
 *
 * 可选第二层（IP 白名单）：
 *   环境变量 IP_WHITELIST —— 逗号分隔的出口 IP，不配置则不校验。
 *
 * 触发方式：云开发控制台 → 云函数 → httpQueryPart → 「HTTP 访问服务」→ 添加路径 /queryPart
 *   https://<环境ID>.service.tcloudbase.com/queryPart?code=333333&token=zhang-8f3k2m
 * ------------------------------------------------------------------
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

// 单次最多返回条数
const MAX_LIMIT = 20

// 对外展示字段：车型 / 年份 / 位置 / 价格 / 库存数量 / 备注
// 注意：这里不包含 kyb_no、warnStock（预警值）等字段，接口不会返回
const SHOW_FIELDS = {
  car_model: true,
  model_year: true,
  direction: true,
  price: true,
  stock: true,
  remark: true
}

// ===== 访问白名单 =====
// 令牌白名单：环境变量 ACCESS_TOKENS，英文逗号分隔
const ACCESS_TOKENS = String(process.env.ACCESS_TOKENS || '')
  .split(',')
  .map(function (s) { return s.trim() })
  .filter(Boolean)

// IP 白名单：环境变量 IP_WHITELIST，英文逗号分隔；不配置则不校验
const IP_WHITELIST = String(process.env.IP_WHITELIST || '')
  .split(',')
  .map(function (s) { return s.trim() })
  .filter(Boolean)

// 正则转义：防止用户输入构造恶意正则（注入 / ReDoS）
const escapeRegExp = function (s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const CORS_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
}

// 统一响应：HTTP 触发返回完整 HTTP 结构
function respond(isHttp, statusCode, payload) {
  if (!isHttp) return payload
  return { statusCode: statusCode, headers: CORS_HEADERS, body: JSON.stringify(payload) }
}

// 解析入参（HTTP 触发 / 普通云函数调用）
function parseParams(event) {
  const isHttp = !!(event && (event.httpMethod || event.requestContext))
  if (!isHttp) return { isHttp: false, params: event || {} }

  const params = Object.assign({}, event.queryStringParameters || {})
  if (event.body) {
    try {
      const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body
      if (body && typeof body === 'object') Object.assign(params, body)
    } catch (e) {
      // body 不是 JSON，忽略
    }
  }
  return { isHttp: true, params: params }
}

// 取客户端 IP（HTTP 访问服务会带 x-forwarded-for）
function clientIp(event) {
  const headers = event.headers || {}
  const xff = headers['x-forwarded-for'] || headers['X-Forwarded-For'] || ''
  const first = String(xff).split(',')[0].trim()
  return first || (event.requestContext && event.requestContext.sourceIp) || ''
}

exports.main = async function (event) {
  event = event || {}
  const parsed = parseParams(event)
  const isHttp = parsed.isHttp
  const params = parsed.params

  // CORS 预检
  if (isHttp && String(event.httpMethod || '').toUpperCase() === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }

  // —— 白名单校验（默认拒绝）——
  if (!ACCESS_TOKENS.length) {
    return respond(isHttp, 403, {
      code: 403,
      msg: '接口未启用：请在云函数环境变量中配置 ACCESS_TOKENS 白名单'
    })
  }
  if (ACCESS_TOKENS.indexOf(String(params.token || '')) === -1) {
    return respond(isHttp, 403, { code: 403, msg: '无访问权限：token 无效或不在白名单内' })
  }
  if (IP_WHITELIST.length && IP_WHITELIST.indexOf(clientIp(event)) === -1) {
    return respond(isHttp, 403, { code: 403, msg: '无访问权限：IP 不在白名单内' })
  }

  const keyword = String(params.code || params.keyword || '').trim()
  if (!keyword) {
    return respond(isHttp, 400, { code: 400, msg: '缺少查询参数：请传入 code 或 keyword' })
  }

  const limit = Math.min(Math.max(parseInt(params.limit, 10) || 10, 1), MAX_LIMIT)
  // 去掉空格与连字符，兼容 "334 245" / "334-245"
  const k = keyword.replace(/[\s\-]+/g, '')
  const safeK = escapeRegExp(k)

  try {
    // 只读查询：按编号命中，只取展示需要的六个字段
    // 查询仍然支持 KYB 号 / OE 号 / 车型 / _id 匹配，但返回结果里不带这些字段
    const res = await db.collection('products')
      .where(_.or([
        { _id: k },                                                  // 扫码 / 精确 ID
        { kyb_no: db.RegExp({ regexp: safeK, options: 'i' }) },       // KYB 号模糊匹配
        { oe_no: db.RegExp({ regexp: safeK, options: 'i' }) },        // OE 号模糊匹配
        { car_model: db.RegExp({ regexp: safeK, options: 'i' }) }     // 车型模糊匹配
      ]))
      .field(SHOW_FIELDS)
      .orderBy('_id', 'desc')
      .limit(limit)
      .get()

    // 归一化输出：最终只保留 车型 / 年份 / 位置 / 价格 / 库存数量 / 备注
    const rows = res.data.map(function (doc) {
      return {
        car_model: doc.car_model || '',
        model_year: doc.model_year || '',
        direction: doc.direction || '',
        price: (doc.price === undefined || doc.price === null) ? 0 : doc.price,
        stock: (doc.stock === undefined || doc.stock === null) ? 0 : doc.stock,
        remark: doc.remark || ''
      }
    })

    if (!rows.length) {
      return respond(isHttp, 404, { code: 404, msg: '未找到该编号对应的配件', keyword: keyword })
    }

    return respond(isHttp, 200, {
      code: 200,
      msg: '查询成功',
      keyword: keyword,
      count: rows.length,
      readonly: true,
      data: rows
    })
  } catch (err) {
    console.error('[httpQueryPart] 查询失败:', err)
    return respond(isHttp, 500, { code: 500, msg: '服务器查询失败：' + err.message })
  }
}
