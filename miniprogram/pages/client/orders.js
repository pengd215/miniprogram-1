Page({
  data: { orders: [], loading: true, errorMessage: '' },

  onShow() { this.loadOrders() },

  onPullDownRefresh() {
    this.loadOrders().finally(() => wx.stopPullDownRefresh())
  },

  loadOrders() {
    this.setData({ loading: true, errorMessage: '' })
    return wx.cloud.callFunction({ name: 'orderManage', data: { action: 'list' } }).then(response => {
      const result = response && response.result
      if (!result || !result.success) throw new Error((result && result.message) || '订单加载失败')
      this.setData({ orders: result.orders || [] })
    }).catch(error => {
      console.error('[client/orders] 加载失败:', error)
      this.setData({ errorMessage: error.message || '订单加载失败' })
    }).finally(() => this.setData({ loading: false }))
  },

  openOrder(event) {
    const orderId = event.currentTarget.dataset.id
    if (orderId) wx.navigateTo({ url: `/pages/client/order-detail?id=${encodeURIComponent(orderId)}` })
  },

  retry() { this.loadOrders() }
})
