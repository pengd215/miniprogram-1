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
    // 这样用户一进来就能看到最新的列表和图片
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
        // 将 oe_no 字符串拆分为数组，供模板三列排布展示
        const list = (res.result.data || []).map(item => {
          let oeList = [];
          if (Array.isArray(item.oe_no)) {
            oeList = item.oe_no.map(v => String(v).trim()).filter(Boolean);
          } else if (item.oe_no) {
            oeList = String(item.oe_no).split(/[,，\s]+/).filter(Boolean);
          }
          return { ...item, oeList };
        });
        this.setData({
          results: list
        },() => {
          // 【核心修改】setData 的回调函数中执行滚动
          // 确保 DOM 渲染完成后再滚动，避免位置跳动
          if (this.data.results.length > 0) {
            wx.pageScrollTo({
              selector: '#result-list', // 对应 WXML 中列表容器的 id
              duration: 300,            // 滚动动画时长（毫秒）
              offsetTop: -20            // 可选：多留一点顶部边距，视觉更舒适
            });
          }
        });
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
