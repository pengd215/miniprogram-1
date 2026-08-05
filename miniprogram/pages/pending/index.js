// pages/pending/index.js
const db = wx.cloud.database();

Page({
  data: {
    pendingList: [] // 存放待完善的数据
  },

  onShow() {
    this.fetchPendingData();
  },

  // 获取待完善数据
  fetchPendingData() {
    wx.showLoading({ title: '加载中...' });
    
    db.collection('products')
      .where({
        status: 'pending' // 只查待完善的
      })
      .orderBy('create_time', 'desc') // 按时间倒序
      .limit(20) // 每次加载20条
      .get()
      .then(res => {
        this.setData({
          pendingList: res.data
        });
        wx.hideLoading();
      })
      .catch(err => {
        console.error(err);
        wx.hideLoading();
      });
  },

  // 点击某一项，跳转到编辑页
  goToEdit(e) {
    const id = e.currentTarget.dataset.id;
    // 跳转到我们接下来要做的编辑页，并把ID传过去
    wx.navigateTo({
      url: `/pages/editPart/index?id=${id}`
    });
  }
})