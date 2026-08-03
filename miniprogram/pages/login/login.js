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
      name: 'userLogin', // 必须和云函数文件夹名字一致
      data: {
        username: username,
        password: password
      },
      success: res => {
        wx.hideLoading()
        console.log('登录结果:', res)
        // 缓存角色到本地（关键！后续所有页面用）
        wx.setStorageSync('userRole', res.result.role)
        wx.setStorageSync('userName', res.result.name)
        wx.setStorageSync('userId', res.result._id)

        // 3. 将用户信息存入 app 全局变量（profile.js 页面会从这里读）
        app.globalData.userInfo = {
          _id: res.result._id,
          role: res.result.role,
          name: res.result.name,
          username: res.result.username,
          openid: res.result.openid
        };
        
        if (res.result && res.result.success) {
          // 1. 登录成功，将关键信息保存到本地缓存（供所有页面使用）
          wx.setStorageSync('userRole', res.result.role)
          wx.setStorageSync('userName', res.result.name)
          
          // 2. 保存到全局变量（供当前运行周期使用）
          app.globalData.userInfo = {
            _id: res.result._id,
            role: res.result.role,
            name: res.result.name,
            openid: res.result.openid
          };

          wx.hideLoading()
          wx.showToast({ title: '登录成功', icon: 'success' })
          
          // 把用户信息存到本地缓存，方便后面页面使用
          wx.setStorageSync('userInfo', res.result.data)
          
          // 跳转到首页（根据你的实际路径修改）
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/index/index' }) 
          }, 1000)
        } else {
          // 登录失败
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