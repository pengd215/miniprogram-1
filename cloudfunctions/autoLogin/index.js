// cloudfunctions/autoLogin/index.js
// 免密登录：用「微信 openid + 会话令牌」双条件换取登录态，本地不保存密码
// 由 pages/login/login.js 的 onLoad 在冷启动时静默调用
const crypto = require('crypto')
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 免密有效期：30 天，滑动续期（每次校验通过自动顺延）
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

// 把数据库返回的时间字段统一转成毫秒时间戳，兼容 Date 与字符串
function toTime(value) {
  if (!value) return 0
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? 0 : t
}

// 清除文档上的会话字段（令牌失效时调用）
async function revokeSession(docId) {
  try {
    await db.collection('employees').doc(docId).update({
      data: {
        session_token: db.command.remove(),
        session_expire_at: db.command.remove(),
        session_openid: db.command.remove(),
        session_issued_at: db.command.remove()
      }
    })
  } catch (err) {
    // 清理失败不影响本次拒绝结果，仅记录日志
    console.error('清除失效会话字段失败:', err)
  }
}

exports.main = async (event) => {
  // openid 由微信侧注入，客户端无法伪造
  const wxContext = cloud.getWXContext()
  const currentOpenId = wxContext.OPENID

  try {
    const sessionToken = event && event.sessionToken

    if (!sessionToken || typeof sessionToken !== 'string' || !currentOpenId) {
      return { success: false, code: 'NO_TOKEN', msg: '登录状态已失效，请重新登录' }
    }

    // 双条件查询：openid 与令牌必须同时匹配，缺一即视为无效
    const res = await db.collection('employees')
      .where({
        _openid: currentOpenId,
        session_token: sessionToken
      })
      .get()

    if (!res.data || res.data.length === 0) {
      return { success: false, code: 'TOKEN_INVALID', msg: '登录状态已失效，请重新登录' }
    }

    const userData = res.data[0]

    // 账号状态校验：停用/离职账号即使令牌有效也必须拦截
    // 这是免密登录相比「本地缓存即身份」最关键的安全改进
    if (userData.status === 'disabled') {
      await revokeSession(userData._id)
      return {
        success: false,
        code: 'ACCOUNT_DISABLED',
        msg: '该账号已停用，请联系管理员'
      }
    }

    // 令牌过期校验
    const expireAt = toTime(userData.session_expire_at)
    if (!expireAt || expireAt <= Date.now()) {
      await revokeSession(userData._id)
      return { success: false, code: 'TOKEN_EXPIRED', msg: '登录状态已过期，请重新登录' }
    }

    // 密码在令牌签发之后被修改过 → 令牌作废，强制重新认证
    const issuedAt = toTime(userData.session_issued_at)
    const pwdUpdatedAt = toTime(userData.pwd_updated_at)
    if (issuedAt && pwdUpdatedAt && issuedAt < pwdUpdatedAt) {
      await revokeSession(userData._id)
      return { success: false, code: 'PASSWORD_CHANGED', msg: '密码已修改，请重新登录' }
    }

    // 校验通过：滑动续期，并轮换令牌（降低长期令牌被复用的风险）
    const newToken = crypto.randomBytes(32).toString('hex')
    const newExpireAt = new Date(Date.now() + SESSION_TTL_MS)

    await db.collection('employees').doc(userData._id).update({
      data: {
        session_token: newToken,
        session_expire_at: newExpireAt,
        session_openid: currentOpenId,
        session_issued_at: db.serverDate()
      }
    })

    return {
      success: true,
      msg: '免密登录成功',
      sessionToken: newToken,
      sessionExpireAt: newExpireAt.getTime(),
      data: {
        _id: userData._id,
        role: userData.role || 'guest',
        name: userData.name || '未知用户',
        username: userData.username,
        avatarUrl: userData.avatarUrl || ''
      }
    }
  } catch (err) {
    console.error('免密登录出错:', err)
    return { success: false, code: 'SERVER_ERROR', msg: '服务器内部错误: ' + err.message }
  }
}