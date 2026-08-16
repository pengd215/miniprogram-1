// pages/client/search.js
Page({
  data: {
    keyword: '',
    results: [],
    isLoading: false
  },

    // 点击放大预览图片
    previewImage(e) {
      const currentImages = e.currentTarget.dataset.images; // 当前商品的所有图片数组
      const currentSrc = e.currentTarget.dataset.current;   // 当前点击的图片链接
      
      wx.previewImage({
        current: currentSrc,
        urls: currentImages,
        success: function() {
          console.log('图片预览成功');
        }
      });
    },

  onLoad() {
    // 【关键】页面加载时，自动执行一次搜索（默认搜全部或空关键词）
    // 这样用户一进来就能看到最新的列表和图片
    // 页面加载时仅启动实时监听，不执行搜索（避免首次空关键词弹提示）
    this.startWatch(); // 启动实时监听，员工端新增/修改后客户端自动更新
  },

  onUnload() {
    // 页面卸载时关闭实时监听，避免资源泄漏
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  },

  // 实时监听 products 集合变化，实现两端同步
  startWatch() {
    if (this.watcher) return;
    const db = wx.cloud.database();
    this.watcher = db.collection('products').watch({
      onChange: (snapshot) => {
        console.log('数据已更新，自动刷新...');
        this.doSearch();
      },
      onError: (err) => {
        console.error('watch 监听失败', err);
        this.watcher = null;
      }
    });
  },

  onShow() {
    // 【关键】每次页面显示时（比如从详情页返回，或从后台切回来），都刷新一次数据
    // 这能解决"后台改了图，前台不更新"的问题
    this.doSearch();
  },

  // 输入框输入事件
  onInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  // 点击搜索按钮
  doSearch() {
    const keyword = this.data.keyword.trim();

    if (!keyword) {
      wx.showToast({ title: '请输入关键词', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '查询中...' })

    wx.cloud.callFunction({
      name: 'clientSearchQuote',
      data: {
        keyword: this.data.keyword
      }
    }).then(res => {
      wx.hideLoading()
      if (res.result.code === 200) {
        this.setData({
          results: res.result.data || []
        })

        if (res.result.data.length === 0) {
          wx.showToast({ title: '未找到相关配件', icon: 'none' })
        }
      } else {
        wx.showToast({
          title: res.result.msg || '查询失败',
          icon: 'none'
        })
      }
    }).catch(err => {
      wx.hideLoading()
      console.error(err)
      wx.showToast({ title: '网络错误', icon: 'none' })
    })
  }
})
