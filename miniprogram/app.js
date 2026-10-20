// app.js

// 免密登录相关的本地缓存键，统一在此定义避免各页面硬编码字符串
const SESSION_TOKEN_KEY = 'sessionToken'
const SESSION_EXPIRE_KEY = 'sessionExpireAt'
const USER_INFO_KEY = 'userInfo'

// 清除本地会话凭据（令牌 + 用户信息）。
// 有意保留 rememberedUsername / rememberAccount / keepLogin，
// 让账号在被顶下线、令牌过期或主动退出后仍能自动回填。
function clearLocalSession() {
  wx.removeStorageSync(SESSION_TOKEN_KEY)
  wx.removeStorageSync(SESSION_EXPIRE_KEY)
  wx.removeStorageSync(USER_INFO_KEY)
  wx.removeStorageSync('userRole')
  wx.removeStorageSync('userName')
  wx.removeStorageSync('userId')
}

App({
  globalData: {
    eventChannel: null, //初始化全局事件通道
    openid: '' ,// 初始化为空字符串
    userInfo: null,
    sessionToken: '',
    sessionExpireAt: 0,
    loginPromise: null // 缓存恢复登录的 Promise，避免多页并发时重复调用云函数
  },
  // 全局预警配置（缓存，避免每次判断都读库）
  globalWarning: {
    lowStock: 10,   // 默认低库存阈值
    maxStock: 100   // 默认最高积压阈值（可选）
  },

  onLaunch: function () {
    // 1. 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-d6g5lmzx0f2b9733e', // 你的环境ID（部署时替换）
        traceUser: true,
      })
    }

    // 2. 【新增代码】获取 OpenID 并赋值给 globalData
    this.getOpenId(); 
  },

  // 统一的本地会话判断。
  // 保留原同步签名，8 处页面的 checkLogin() 调用点无需改动。
  // 服务端强校验由登录页冷启动时的 restoreSession() 统一完成。
  checkLogin() {
    // 1) 本次运行内已通过密码或令牌认证：内存态直接放行。
    //    这一分支保证「未勾选免密登录」的用户登录后不会被弹回登录页。
    if (this.globalData.userInfo && this.globalData.userInfo._id) return true

    // 2) 冷启动或深层链接进入：令牌未过期且本地有用户信息才放行。
    const token = wx.getStorageSync(SESSION_TOKEN_KEY)
    const expireAt = wx.getStorageSync(SESSION_EXPIRE_KEY)
    if (token && expireAt && expireAt > Date.now()) {
      const cached = wx.getStorageSync(USER_INFO_KEY)
      if (cached && cached._id) {
        this.globalData.userInfo = cached
        this.globalData.sessionToken = token
        this.globalData.sessionExpireAt = expireAt
        return true
      }
      // 令牌仍有效但用户信息缺失：保留令牌回登录页，
      // 由 restoreSession() 向服务端重新校验并补全用户信息，避免无谓地要求重输密码
      wx.reLaunch({ url: '/pages/login/login' })
      return false
    }

    // 3) 无有效会话：清理残留并回到登录页
    clearLocalSession()
    wx.reLaunch({ url: '/pages/login/login' })
    return false
  },

  // 把用户信息统一裁剪后写入 globalData 与本地缓存。
  // 正常登录与免密恢复都走这里，消除两条路径字段不一致的问题。
  setUserInfo(userInfo) {
    const normalized = {
      _id: userInfo._id,
      role: userInfo.role,
      name: userInfo.name,
      username: userInfo.username,
      avatarUrl: userInfo.avatarUrl || ''
    }
    this.globalData.userInfo = normalized
    wx.setStorageSync(USER_INFO_KEY, normalized)
    wx.setStorageSync('userRole', normalized.role)
    wx.setStorageSync('userName', normalized.name)
    wx.setStorageSync('userId', normalized._id)
    return normalized
  },

  // 保存会话令牌（密码登录成功后、免密续期后都会调用）
  setSession(token, expireAt) {
    this.globalData.sessionToken = token || ''
    this.globalData.sessionExpireAt = expireAt || 0
    if (token) {
      wx.setStorageSync(SESSION_TOKEN_KEY, token)
      wx.setStorageSync(SESSION_EXPIRE_KEY, expireAt)
    }
  },

  // 冷启动时尝试用本地令牌静默换取登录态。
  // 返回 Promise<boolean>：true 表示免密成功，false 表示需要走密码登录。
  // 全程静默降级，除「账号已停用」外不弹任何技术错误。
  restoreSession() {
    // 复用进行中的 Promise，避免多个页面并发触发重复云调用
    if (this.globalData.loginPromise) return this.globalData.loginPromise

    const token = wx.getStorageSync(SESSION_TOKEN_KEY)
    const expireAt = wx.getStorageSync(SESSION_EXPIRE_KEY)

    // 本地先判过期，省掉一次无谓的云调用
    if (!token || !expireAt || expireAt <= Date.now()) {
      clearLocalSession()
      return Promise.resolve(false)
    }

    this.globalData.loginPromise = wx.cloud.callFunction({
      name: 'autoLogin',
      data: { sessionToken: token }
    }).then(res => {
      this.globalData.loginPromise = null
      const result = res && res.result
      if (result && result.success) {
        this.setSession(result.sessionToken, result.sessionExpireAt)
        this.setUserInfo(result.data || {})
        return true
      }
      // 免密失败：清除本地会话，静默回落到密码登录
      clearLocalSession()
      this.globalData.userInfo = null
      // 账号被停用是需要让用户知道的例外情况
      if (result && result.code === 'ACCOUNT_DISABLED') {
        wx.showToast({ title: result.msg || '该账号已停用', icon: 'none' })
      }
      return false
    }).catch(err => {
      this.globalData.loginPromise = null
      console.error('免密登录失败:', err)
      clearLocalSession()
      this.globalData.userInfo = null
      return false
    })

    return this.globalData.loginPromise
  },

  // 服务端登出：撤销令牌后清理本地会话。失败不阻塞本地退出。
  logout() {
    return wx.cloud.callFunction({
      name: 'userLogin',
      data: { action: 'logout' }
    }).catch(err => {
      console.error('服务端登出失败（已忽略，继续本地退出）:', err)
    }).then(() => {
      clearLocalSession()
      this.globalData.userInfo = null
      this.globalData.sessionToken = ''
      this.globalData.sessionExpireAt = 0
    })
  },

  // 专门用来获取 OpenID
  getOpenId() {
    const that = this;
    wx.cloud.callFunction({
      name: 'userLogin', // 调用云函数 'userlogin' (微信默认自带的获取openid的函数)
      success(res) {
        console.log('获取 OpenID 成功:', res.result.openid);
        // 将获取到的 openid 存入 globalData
        that.globalData.openid = res.result.openid;
      },
      fail(err) {
        console.error('获取 OpenID 失败:', err);
      }
    })
  },
  // 从 settings 集合读取全局预警配置
  loadWarningConfig() {
  const db = wx.cloud.database();
  return db.collection('settings').doc('warning').get()
    .then(res => {
      const d = res.data || {};
      this.globalWarning = {
        lowStock: d.lowStock || 10,
        maxStock: d.maxStock || 100
      };
      return this.globalWarning;
    })
    .catch(() => {
      // 读取失败用默认值
      return this.globalWarning;
    });
  },

// 计算单品的库存状态
// 返回: 'normal' | 'low' | 'out' ，以及对应文案
  getStockStatus(stock, product) {
  // 单品自定义预警值优先
  const warnStock = (product && product.warnStock) || this.globalWarning.lowStock;
  if (stock <= 0) return { status: 'out', text: '缺货', color: 'status-out', listClass: 'stock-out' };
  if (stock < warnStock) return { status: 'low', text: '紧张', color: 'status-low', listClass: 'stock-low' };
  return { status: 'normal', text: '充足', color: 'status-in', listClass: 'stock-in' };
  }
})
