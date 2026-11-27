const clientCart = require('../../utils/clientCart')

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

const PENDING_REQUEST_KEY = 'clientPendingOrderRequestId'

Page({
  data: {
    requestId: '',
    quoteId: '',
    items: [],
    totalAmount: '0.00',
    priceChanges: [],
    contactName: '',
    contactPhone: '',
    remark: '',
    loading: true,
    submitting: false,
    errorMessage: ''
  },

  onLoad() {
    const user = wx.getStorageSync('userInfo') || {}
    let requestId = wx.getStorageSync(PENDING_REQUEST_KEY)
    if (!requestId) {
      requestId = createRequestId()
      wx.setStorageSync(PENDING_REQUEST_KEY, requestId)
    }
    this.setData({ requestId, contactName: user.name || '' })
    this.prepareQuote()
  },

  prepareQuote() {
    this.setData({ loading: true, errorMessage: '' })
    return wx.cloud.callFunction({
      name: 'submitOrder',
      data: { action: 'prepare', requestId: this.data.requestId }
    }).then(response => {
      const result = response && response.result
      if (!result || !result.success) throw new Error((result && result.message) || '报价准备失败')
      this.setData({
        quoteId: result.quoteId,
        items: result.items || [],
        totalAmount: Number(result.totalAmount || 0).toFixed(2),
        priceChanges: result.priceChanges || []
      })
    }).catch(error => {
      this.setData({ errorMessage: error.message || '报价准备失败' })
    }).finally(() => this.setData({ loading: false }))
  },

  onFieldInput(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value })
  },

  submitOrder(confirmedPriceChange) {
    if (this.data.submitting || !this.data.quoteId) return
    this.setData({ submitting: true, errorMessage: '' })
    wx.cloud.callFunction({
      name: 'submitOrder',
      data: {
        action: 'submit',
        quoteId: this.data.quoteId,
        requestId: this.data.requestId,
        contactName: this.data.contactName,
        contactPhone: this.data.contactPhone,
        remark: this.data.remark
      }
    }).then(response => {
      const result = response && response.result
      if (result && result.needsPriceConfirm) {
        this.setData({ quoteId: result.quoteId, items: result.items || [], totalAmount: Number(result.totalAmount || 0).toFixed(2), priceChanges: result.priceChanges || [] })
        this.setData({ submitting: false })
        this.confirmLatestPrice()
        return
      }
      if (!result || !result.success) throw new Error((result && result.message) || '订单提交失败')
      wx.removeStorageSync(PENDING_REQUEST_KEY)
      wx.redirectTo({ url: `/pages/client/order-detail?id=${encodeURIComponent(result.order._id)}&submitted=1` })
    }).catch(error => {
      this.setData({ errorMessage: error.message || '订单提交失败', submitting: false })
    }).finally(() => {
      if (!confirmedPriceChange && this.data.submitting) this.setData({ submitting: false })
    })
  },

  confirmLatestPrice() {
    wx.showModal({
      title: '报价已变化',
      content: '商品报价已更新，请核对最新金额后再提交。库存和最终报价由业务员确认。',
      confirmText: '确认新报价',
      cancelText: '暂不提交',
      success: result => { if (result.confirm) this.submitOrder(true) }
    })
  },

  onSubmitTap() {
    if (!this.data.contactName.trim() || !this.data.contactPhone.trim()) {
      wx.showToast({ title: '请填写联系人和联系电话', icon: 'none' })
      return
    }
    const content = this.data.priceChanges.length
      ? '购物车中的报价发生过变化，请确认使用当前报价提交。库存和最终报价以业务员确认结果为准。'
      : `确认提交 ${this.data.items.length} 种商品的订单意向？本操作不锁定库存，也不会产生在线支付。`
    wx.showModal({
      title: this.data.priceChanges.length ? '确认最新报价' : '提交订单意向',
      content,
      confirmText: '确认提交',
      success: result => { if (result.confirm) this.submitOrder(Boolean(this.data.priceChanges.length)) }
    })
  },

  retry() { this.prepareQuote() },

  backToCart() { wx.navigateBack() }
})
