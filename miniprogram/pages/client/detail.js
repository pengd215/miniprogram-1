const clientCart = require('../../utils/clientCart')

Page({
  data: {
    productId: '',
    product: null,
    currentImage: 0,
    isLoading: true,
    errorMessage: ''
  },

  onLoad(options) {
    const productId = String(options.id || '').trim()
    if (!productId) {
      this.setData({ isLoading: false, errorMessage: '商品信息无效' })
      return
    }
    this.setData({ productId })
    this.loadDetail()
  },

  onPullDownRefresh() {
    this.loadDetail().finally(() => wx.stopPullDownRefresh())
  },

  loadDetail() {
    this.setData({ isLoading: true, errorMessage: '' })
    return wx.cloud.callFunction({
      name: 'clientListProducts',
      data: { action: 'detail', productId: this.data.productId }
    }).then(response => {
      const result = response && response.result
      if (!result || !result.success) throw new Error((result && result.message) || '商品已下架或不存在')
      this.setData({ product: result.product, currentImage: 0 })
    }).catch(error => {
      console.error('[client/detail] 加载详情失败:', error)
      this.setData({ product: null, errorMessage: error.message || '商品详情加载失败' })
    }).finally(() => {
      this.setData({ isLoading: false })
    })
  },

  onImageChange(event) {
    this.setData({ currentImage: event.detail.current })
  },

  onImageError(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!this.data.product || !Number.isInteger(index) || !this.data.product.images[index]) return
    this.setData({ [`product.images[${index}]`]: '/images/default-product.png' })
  },

  previewImages() {
    const images = this.data.product && this.data.product.images
    if (!images || !images.length) return
    wx.previewImage({ current: images[this.data.currentImage], urls: images })
  },

  addToCart() {
    if (!this.data.product || this.addingToCart) return
    this.addingToCart = true
    clientCart.addProduct(this.data.product._id).then(result => {
      const tabbar = this.selectComponent('#client-tabbar')
      if (tabbar) tabbar.setCartCount(result.count)
      wx.showToast({ title: '已加入购物车', icon: 'success' })
    }).catch(error => {
      wx.showToast({ title: error.message || '加购失败', icon: 'none' })
    }).finally(() => { this.addingToCart = false })
  },

  goBack() {
    const pages = getCurrentPages()
    if (pages.length > 1) {
      wx.navigateBack()
    } else {
      wx.reLaunch({ url: '/pages/client/home' })
    }
  }
})
