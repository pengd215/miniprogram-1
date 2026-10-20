// cloudfunctions/userLogin/index.js
// 登录：员工账号密码校验，密码以 sha256(盐+密码) 哈希存储
// 兼容处理：存量账号若为明文密码，登录成功时自动迁移为哈希存储
// 免密登录：密码校验通过后签发会话令牌，本地只存令牌不存密码
// 登出：action='logout' 时撤销服务端令牌，实现真正的服务端退出
const crypto = require('crypto')
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) 
const db = cloud.database()

// 免密有效期：30 天，滑动续期（由 autoLogin 云函数每次校验通过时顺延）
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

// 单令牌策略：同一账号后登录的设备会覆盖前一台的令牌，
// 被顶掉的设备下次打开需重新输密码，但账号仍会被记住并回填
async function revokeSessionByOpenId(openId) {
  if (!openId) return
  try {
    const res = await db.collection('employees')
      .where({ _openid: openId })
      .get()
    if (!res.data || res.data.length === 0) return
    await db.collection('employees').doc(res.data[0]._id).update({
      data: {
        session_token: db.command.remove(),
        session_expire_at: db.command.remove(),
        session_openid: db.command.remove(),
        session_issued_at: db.command.remove()
      }
    })
  } catch (err) {
    console.error('撤销会话令牌失败:', err)
  }
}

// 生成密码哈希：格式 "salt:hash"
function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex')
  const hash = crypto.createHash('sha256').update(s + password).digest('hex')
  return s + ':' + hash
}

// 校验密码：支持哈希格式与存量明文格式
// 返回 { ok, needsMigrate }，needsMigrate 表示是明文匹配成功需要迁移
function verifyPassword(stored, inputPassword) {
  if (!stored) return { ok: false }
  const idx = stored.indexOf(':')
  if (idx > 0 && stored.length - idx === 65) { // 形如 "32位salt:64位hash"
    const salt = stored.slice(0, idx)
    const storedHash = stored.slice(idx + 1)
    const calcHash = crypto.createHash('sha256').update(salt + inputPassword).digest('hex')
    return { ok: calcHash === storedHash, needsMigrate: false }
  }
  // 存量明文
  return { ok: stored === inputPassword, needsMigrate: true }
}

exports.main = async (event, context) => {
  // 获取当前用户的 OpenID (微信自动注入)
  const wxContext = cloud.getWXContext()
  const currentOpenId = wxContext.OPENID// 获取当前登录微信的 OpenID

  try {
    const { username, password } = event

    // 登出模式：撤销服务端会话令牌，让「退出登录」成为真退出
    // 注意：必须放在下面的 openid 兼容分支之前，否则无账号密码的登出请求会被兼容分支拦截
    if (event && event.action === 'logout') {
      await revokeSessionByOpenId(currentOpenId)
      return { success: true, msg: '已退出登录' }
    }

    // 兼容模式：无账号密码参数时，仅返回当前微信 OpenID（供个人信息页查询用）
    if (!username && !password) {
      return { success: true, openid: currentOpenId }
    }

    // 参数校验
    if (!username || typeof username !== 'string' || !password) {
      return { success: false, msg: '请输入账号和密码' }
    }

    // 1. 按用户名 + 密码去查询员工表（先按用户名查，再比对密码，避免明文密码做查询条件）
    const res = await db.collection('employees')
    .where({
      username: username
    }).get()

    if (res.data.length > 0) {
      const userData = res.data[0]
      const userStored = userData.password || ''

      // 账号状态校验：离职/停用的账号禁止登录（兼容存量数据：无 status 字段视为启用）
      if (userData.status === 'disabled') {
        return { success: false, msg: '该账号已停用，请联系管理员' }
      }

      // 校验密码
      const verify = verifyPassword(userStored, password)
      if (!verify.ok) return { success: false, msg: '账号或密码错误' }

      // 存量明文账号：登录成功后自动迁移为哈希存储
      if (verify.needsMigrate) {
        await db.collection('employees').doc(userData._id).update({
          data: { password: hashPassword(password), pwd_updated_at: db.serverDate() }
        })
      }

      // 2. 检查该账号是否已经绑定了 OpenID
      if (userData._openid) {
        if (userData._openid !== currentOpenId) {
          return {
            success: false,
            msg: '该账号已绑定其他微信，请联系管理员注册账户！'
          }
        }
      } else {
        // 未绑定（首次登录）：将当前微信的 OpenID 写入数据库，完成绑定
        await db.collection('employees').doc(userData._id).update({
          data: {
            _openid: currentOpenId
          }
        })
      }

      // 3. 签发会话令牌（仅在客户端勾选「保持登录」时）
      // 单令牌策略：新登录会覆盖旧令牌，被顶掉的设备下次需重新输密码，
      // 但其本地 rememberedUsername 仍保留，账号会自动回填
      let sessionToken = null
      let sessionExpireAt = null

      if (event.remember !== false) {
        sessionToken = crypto.randomBytes(32).toString('hex')
        sessionExpireAt = Date.now() + SESSION_TTL_MS
        try {
          await db.collection('employees').doc(userData._id).update({
            data: {
              session_token: sessionToken,
              session_expire_at: new Date(sessionExpireAt),
              session_openid: currentOpenId,
              session_issued_at: db.serverDate()
            }
          })
        } catch (err) {
          // 令牌写入失败不应阻断本次密码登录，降级为「本次已登录、下次需重登」
          console.error('写入会话令牌失败:', err)
          sessionToken = null
          sessionExpireAt = null
        }
      }

      return {
        success: true,
        msg: '登录成功',
        sessionToken: sessionToken,
        sessionExpireAt: sessionExpireAt,
        data: {
          _id: userData._id,
          role: userData.role || 'guest',
          name: userData.name || '未知用户',
          username: userData.username,
          avatarUrl: userData.avatarUrl || ''
        }
      }
    } else {
      return { success: false, msg: '账号或密码错误' }
    }
  } catch (err) {
    console.error('数据库查询出错:', err)
    return { success: false, msg: '服务器内部错误: ' + err.message }
  }
}
