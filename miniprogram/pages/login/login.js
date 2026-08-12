const app = getApp();
Page({
  data: {
    username: '',
    password: ''
  },

  // 获取输入的用户名
  onInputUser(e) {
    this.setData({ username: e.detail.value })
  },

  // 获取输入的密码
  onInputPass(e) {
    this.setData({ password: e.detail.value })
  },

  // 点击登录按钮
  handleLogin() {
    const { username, password } = this.data

    if (!username || !password) {
      wx.showToast({ title: '账号密码不能为空', icon: 'none' })
      return
    }

    wx.showLoading({ title: '登录中...' })

    // 调用刚才部署的云函数
    wx.cloud.callFunction({
      name: 'userLogin', 
      data: {
        username: username,
        password: password
      },
      success: res => {
        wx.hideLoading()
        
        if (res.result && res.result.success) {
          const userInfo = res.result.data || res.result

        // 缓存角色到本地（关键！后续所有页面用）
        wx.setStorageSync('userRole', userInfo.role)
        wx.setStorageSync('userName', userInfo.name)
        wx.setStorageSync('userId', userInfo._id)
        wx.setStorageSync('userInfo', userInfo)
        // 3. 将用户信息存入 app 全局变量
        app.globalData.userInfo = {
          _id: userInfo._id,
          role: userInfo.role,
          name: userInfo.name,
          username: userInfo.username,
          _openid: res.result._openid
        };

          wx.hideLoading()
          wx.showToast({ title: '登录成功', icon: 'success' })
          
          // 把用户信息存到本地缓存，方便后面页面使用
          wx.setStorageSync('userInfo', userInfo)
          
          // 跳转到首页
          setTimeout(() => {
            if (userInfo.role === 'customer') {
              // 客户端 → 报价查询页
              wx.reLaunch({ url: '/pages/client/search' })
            } else {
              // 内部员工 → 管理后台首页
              wx.reLaunch({ url: '/pages/index/index' })
            }
          }, 1000)

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