const clientCart = require('../../utils/clientCart')

Page({
  data: {
    products: [],
    isLoading: false,
    hasMore: true,
    hasLoaded: false,
    loadError: false,
    offset: 0
  },

  onLoad() {
    this.loadProducts(true)
  },

  onPullDownRefresh() {
    this.loadProducts(true).finally(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) this.loadProducts(false)
  },

  loadProducts(reset) {
    if (this.data.isLoading) return Promise.resolve()
    const offset = reset ? 0 : this.data.offset
    this.setData({
      isLoading: true,
      loadError: false,
      ...(reset ? { products: [], offset: 0, hasMore: true, hasLoaded: false } : {})
    })

    return wx.cloud.callFunction({
      name: 'clientListProducts',
      data: { action: 'showcase', offset, pageSize: 8 }
    }).then(response => {
      const result = response && response.result
      if (!result || !result.success) throw new Error((result && result.message) || '商品加载失败')
      const mappedItems = result.items.map(item => ({ ...item, coverImage: item.images[0] }))
      const products = reset ? mappedItems : this.data.products.concat(mappedItems)
      this.setData({
        products,
        offset: result.nextOffset,
        hasMore: result.hasMore,
        hasLoaded: true,
        loadError: false
      })
    }).catch(error => {
      console.error('[client/home] 加载商品失败:', error)
      this.setData({ loadError: true, hasLoaded: true })
    }).finally(() => {
      this.setData({ isLoading: false })
    })
  },

  retryLoad() {
    this.loadProducts(true)
  },

  loadMore() {
    this.loadProducts(false)
  },

  openDetail(event) {
    const productId = event.currentTarget.dataset.id
    if (!productId) return
    wx.navigateTo({ url: `/pages/client/detail?id=${encodeURIComponent(productId)}` })
  },

  addToCart(event) {
    const productId = event.currentTarget.dataset.id
    if (!productId || this.addingProductId) return
    this.addingProductId = productId
    clientCart.addProduct(productId).then(result => {
      const tabbar = this.selectComponent('#client-tabbar')
      if (tabbar) tabbar.setCartCount(result.count)
      wx.showToast({ title: '已加入购物车', icon: 'success' })
    }).catch(error => {
      wx.showToast({ title: error.message || '加购失败', icon: 'none' })
    }).finally(() => { this.addingProductId = '' })
  },

  onImageError(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.products[index]) return
    this.setData({ [`products[${index}].coverImage`]: '/images/default-product.png' })
  }
})
