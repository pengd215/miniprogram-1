const clientCart = require('../../utils/clientCart')

Page({
  data: {
    keyword: '',
    results: [],
    hasSearched: false,
    isLoading: false,
    errorMessage: ''
  },

  onInput(event) {
    this.setData({ keyword: event.detail.value })
  },

  clearKeyword() {
    this.setData({ keyword: '' })
  },

  doSearch() {
    const keyword = String(this.data.keyword || '').trim()
    if (!keyword) {
      wx.showToast({ title: '请输入查询关键词', icon: 'none' })
      return
    }
    if (this.data.isLoading) return

    this.setData({ isLoading: true, hasSearched: true, errorMessage: '', results: [] })
    wx.cloud.callFunction({
      name: 'clientSearchQuote',
      data: { keyword }
    }).then(response => {
      const result = response && response.result
      if (!result || result.code !== 200) {
        throw new Error((result && result.msg) || '查询失败')
      }
      const list = (result.data || []).map(item => {
        const rawOe = Array.isArray(item.oe_list) && item.oe_list.length
          ? item.oe_list
          : (item.oe_no || [])
        const oeList = Array.isArray(rawOe)
          ? rawOe.map(value => String(value).trim()).filter(Boolean)
          : String(rawOe).split(/[,，\s]+/).filter(Boolean)
        const images = Array.isArray(item.images) ? item.images : []
        return {
          ...item,
          oeList,
          visibleOeList: oeList.slice(0, 3),
          moreOeCount: Math.max(oeList.length - 3, 0),
          coverImage: images[0] || '/images/default-product.png'
        }
      })
      this.setData({ results: list })
      if (!list.length) wx.showToast({ title: '未找到相关配件', icon: 'none' })
    }).catch(error => {
      console.error('[client/search] 查询失败:', error)
      this.setData({ results: [], errorMessage: error.message || '查询失败' })
    }).finally(() => {
      this.setData({ isLoading: false })
    })
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

  previewImage(event) {
    const current = event.currentTarget.dataset.current
    const urls = event.currentTarget.dataset.images || []
    if (!current || !urls.length) return
    wx.previewImage({ current, urls })
  },

  onImageError(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || !this.data.results[index]) return
    this.setData({ [`results[${index}].coverImage`]: '/images/default-product.png' })
  }
})
