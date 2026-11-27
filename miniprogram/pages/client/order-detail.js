Page({
  data: { order: null, loading: true, errorMessage: '', submitted: false },

  onLoad(options) {
    this.setData({ submitted: options.submitted === '1', orderId: String(options.id || '') })
    this.loadOrder()
  },

  onPullDownRefresh() {
    this.loadOrder().finally(() => wx.stopPullDownRefresh())
  },

  loadOrder() {
    if (!this.data.orderId) {
      this.setData({ loading: false, errorMessage: '订单编号无效' })
      return Promise.resolve()
    }
    this.setData({ loading: true, errorMessage: '' })
    return wx.cloud.callFunction({ name: 'orderManage', data: { action: 'detail', orderId: this.data.orderId } }).then(response => {
      const result = response && response.result
      if (!result || !result.success) throw new Error((result && result.message) || '订单加载失败')
      this.setData({ order: result.order })
    }).catch(error => {
      this.setData({ errorMessage: error.message || '订单加载失败' })
    }).finally(() => this.setData({ loading: false }))
  },

  goOrders() { wx.redirectTo({ url: '/pages/client/orders' }) },
  goHome() { wx.reLaunch({ url: '/pages/client/home' }) }
})
