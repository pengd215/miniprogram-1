const app = getApp();

// 免密登录默认有效期，仅在服务端未返回过期时间时作为本地兜底
const FALLBACK_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

Page({
  data: {
    username: '',
    password: '',
    rememberAccount: true,
    keepLogin: true,
    restoring: true
  },

  onLoad() {
    // 恢复用户偏好。注意：这里只恢复账号与开关状态，绝不恢复密码
    const rememberedUsername = wx.getStorageSync('rememberedUsername') || ''
    const keepLogin = wx.getStorageSync('keepLogin') !== false
    // 免密登录必然隐含记住账号，避免历史缓存中出现两个开关互相矛盾的状态
    const rememberAccount = keepLogin ? true : (wx.getStorageSync('rememberAccount') !== false)
    this.setData({ username: rememberedUsername, rememberAccount, keepLogin })

    // 冷启动免密：用本地令牌向服务端静默换取登录态。
    // 校验通过直达业务页，失败则静默露出登录表单（账号已回填）。
    app.restoreSession().then(ok => {
      if (ok) {
        this.redirectByRole(app.globalData.userInfo)
        return
      }
      this.setData({ restoring: false })
    })
  },

  redirectByRole(userInfo) {
    if (!userInfo || !userInfo._id) {
      this.setData({ restoring: false })
      return
    }
    wx.reLaunch({
      url: userInfo.role === 'customer' ? '/pages/client/home' : '/pages/index/index'
    })
  },

  // 获取输入的用户名
  onInputUser(e) {
    this.setData({ username: e.detail.value })
  },

  // 获取输入的密码
  onInputPass(e) {
    this.setData({ password: e.detail.value })
  },

  onRememberAccountChange(e) {
    const checked = e.detail.value.length > 0
    // 勾选免密时账号必须记住（令牌已含身份信息），因此免密状态下不允许单独取消记住账号
    if (!checked && this.data.keepLogin) return
    this.setData({ rememberAccount: checked })
  },

  onKeepLoginChange(e) {
    const checked = e.detail.value.length > 0
    // 免密登录隐含记住账号；取消免密时保留原有的记住账号偏好，不回退用户的独立选择
    this.setData(checked ? { keepLogin: true, rememberAccount: true } : { keepLogin: false })
  },

  // 点击登录按钮
  handleLogin() {
    const { username, password } = this.data

    if (!username || !password) {
      wx.showToast({ title: '账号密码不能为空', icon: 'none' })
      return
    }

    wx.showLoading({ title: '登录中...' })

    wx.cloud.callFunction({
      name: 'userLogin',
      data: {
        username: username,
        password: password,
        remember: this.data.keepLogin // 勾选免密时服务端才签发令牌
      },
      success: res => {
        wx.hideLoading()

        if (res.result && res.result.success) {
          const result = res.result
          const userInfo = result.data || result

          // 记住账号：仅保存用户名，用于下次自动回填
          if (this.data.rememberAccount) wx.setStorageSync('rememberedUsername', username)
          else wx.removeStorageSync('rememberedUsername')
          wx.setStorageSync('rememberAccount', this.data.rememberAccount)
          wx.setStorageSync('keepLogin', this.data.keepLogin)

          // 会话令牌：本地只存令牌与过期时间，密码不落盘
          // 单令牌策略下，本账号在其他设备登录会顶掉当前令牌
          if (result.sessionToken) {
            app.setSession(result.sessionToken, result.sessionExpireAt || (Date.now() + FALLBACK_SESSION_TTL_MS))
          } else {
            // 服务端未签发令牌（未勾选免密或写入失败）：清掉残留令牌，避免用旧令牌误判登录态
            app.setSession('', 0)
            wx.removeStorageSync('sessionToken')
            wx.removeStorageSync('sessionExpireAt')
          }

          // 统一走 app.setUserInfo 写入 globalData 与本地缓存，
          // 保证免密恢复与密码登录两条路径的用户信息结构一致
          const normalized = app.setUserInfo(userInfo)

          wx.showToast({ title: '登录成功', icon: 'success' })
          setTimeout(() => this.redirectByRole(normalized), 1000)

        } else {
          wx.showToast({ title: res.result.msg || '登录失败', icon: 'none' })
        }
      },
      fail: err => {
        wx.hideLoading()
        console.error(err)
        wx.showToast({ title: '网络错误，请检查云函数', icon: 'none' })
      }
    })
  }
})
