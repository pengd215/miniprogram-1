const app = getApp()

Page({
  data: {
    userInfo: {}
  },

  onShow() {
    this.setData({ userInfo: wx.getStorageSync('userInfo') || {} })
  },

  openOrders() {
    wx.navigateTo({ url: '/pages/client/orders' })
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号吗？',
      success: result => {
        if (!result.confirm) return
        wx.showLoading({ title: '退出中' })
        app.logout().then(() => {
          wx.hideLoading()
          wx.reLaunch({ url: '/pages/login/login' })
        }).catch(() => {
          wx.hideLoading()
          wx.showToast({ title: '退出失败，请重试', icon: 'none' })
        })
      }
    })
  }
})
