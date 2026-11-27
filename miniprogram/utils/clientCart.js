function createRequestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

function updateCartCount(count) {
  const app = getApp()
  app.globalData.cartCount = Number(count) || 0
}

function callCart(action, data) {
  return wx.cloud.callFunction({ name: 'cartManage', data: { action, ...(data || {}) } }).then(response => {
    const result = response && response.result
    if (action === 'list' && result && result.success === false && /购物车|记录不存在|不存在/.test(result.message || '')) {
      updateCartCount(0)
      return { success: true, items: [], count: 0, recovered: true }
    }
    if (!result || !result.success) throw new Error((result && result.message) || '购物车操作失败')
    if (result.count !== undefined) updateCartCount(result.count)
    return result
  })
}

function addProduct(productId, quantity) {
  return callCart('add', { productId, quantity: quantity || 1, requestId: createRequestId() })
}

module.exports = { addProduct, callCart, updateCartCount }
