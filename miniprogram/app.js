// app.js
App({
  globalData: {
    eventChannel: null // ✅ 初始化全局事件通道
  },

  onLaunch: function () {
    // 1. 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-d6g5lmzx0f2b9733e', // 你的环境ID
        traceUser: true,
      })
    }

    // 2. 【新增代码】获取 OpenID 并赋值给 globalData
    this.getOpenId(); 
  },

  // 【新增函数】专门用来获取 OpenID
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

  // 3. 【新增定义】定义全局变量对象
  globalData: {
    openid: '' ,// 初始化为空字符串
    userInfo: null
  }
})