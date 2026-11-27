const clientCart = require('../../utils/clientCart')

Page({
  data: { items: [], loading: true, errorMessage: '', selectedTotal: 0, selectedCount: 0 },

  onShow() { this.loadCart() },

  onPullDownRefresh() {
    this.loadCart().finally(() => wx.stopPullDownRefresh())
  },

  loadCart() {
    this.setData({ loading: true, errorMessage: '' })
    return clientCart.callCart('list').then(result => {
      const items = result.items.map(item => ({ ...item, displayProduct: item.product || item.snapshot }))
      this.setData({ items }, () => this.updateSummary())
    }).catch(error => {
      console.error('[client/cart] 加载购物车失败:', error)
      this.setData({ errorMessage: error.message || '购物车加载失败' })
    }).finally(() => this.setData({ loading: false }))
  },

  updateSummary() {
    const selected = this.data.items.filter(item => item.selected && item.available)
    const selectedTotal = selected.reduce((sum, item) => sum + Number(item.product.price || 0) * item.quantity, 0)
    this.setData({ selectedCount: selected.reduce((sum, item) => sum + item.quantity, 0), selectedTotal: selectedTotal.toFixed(2) })
  },

  perform(action, data) {
    return clientCart.callCart(action, data).then(() => this.loadCart()).catch(error => {
      wx.showToast({ title: error.message || '操作失败', icon: 'none' })
    })
  },

  changeQuantity(event) {
    const item = this.data.items[Number(event.currentTarget.dataset.index)]
    if (!item) return
    const next = item.quantity + Number(event.currentTarget.dataset.step)
    if (next < 1 || next > 99) return
    this.perform('quantity', { cartId: item._id, quantity: next })
  },

  removeItem(event) {
    const cartId = event.currentTarget.dataset.id
    wx.showModal({ title: '移出购物车', content: '确定移除这件商品吗？', success: result => {
      if (result.confirm) this.perform('remove', { cartId })
    } })
  },

  toggleSelected(event) {
    const item = this.data.items[Number(event.currentTarget.dataset.index)]
    if (item) this.perform('select', { cartId: item._id, selected: !item.selected })
  },

  checkout() {
    if (!this.data.selectedCount) {
      wx.showToast({ title: '请先勾选可提交的商品', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/pages/client/checkout' })
  },

  retryLoad() { this.loadCart() }
})
