// cloudfunctions/userLogin/index.js
// 登录：员工账号密码校验，密码以 sha256(盐+密码) 哈希存储
// 兼容处理：存量账号若为明文密码，登录成功时自动迁移为哈希存储
const crypto = require('crypto')
const cloud = require('wx-server-sdk')

// 初始化云开发环境
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) 
const db = cloud.database()

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
      return {
        success: true,
        msg: '登录成功',
        data: {
          _id: userData._id,
          role: userData.role || 'guest',
          name: userData.name || '未知用户',
          username: userData.username
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
