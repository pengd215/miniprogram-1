Component({
  properties: {
    active: {
      type: String,
      value: 'home'
    }
  },

  data: {
    cartCount: 0,
    tabs: [
      { key: 'home', label: '首页', path: '/pages/client/home' },
      { key: 'search', label: '查询', path: '/pages/client/search' },
      { key: 'cart', label: '购物车', path: '/pages/client/cart' },
      { key: 'mine', label: '我的', path: '/pages/client/mine' }
    ]
  },

  lifetimes: {
    attached() {
      this.refreshCartCount()
    }
  },

  pageLifetimes: {
    show() {
      this.refreshCartCount()
    }
  },

  methods: {
    refreshCartCount() {
      const app = getApp()
      const cached = Number(app.globalData.cartCount) || 0
      this.setData({ cartCount: cached })
      wx.cloud.callFunction({ name: 'cartManage', data: { action: 'count' } }).then(response => {
        const result = response && response.result
        if (!result || !result.success) return
        app.globalData.cartCount = Number(result.count) || 0
        this.setData({ cartCount: app.globalData.cartCount })
      }).catch(error => console.warn('[client-tabbar] 购物车计数加载失败:', error))
    },

    setCartCount(count) {
      const value = Number(count) || 0
      getApp().globalData.cartCount = value
      this.setData({ cartCount: value })
    },

    selectTab(event) {
      const tab = this.data.tabs.find(item => item.key === event.currentTarget.dataset.key)
      if (!tab || tab.key === this.data.active) return
      wx.reLaunch({ url: tab.path })
    }
  }
})
