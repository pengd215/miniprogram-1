// pages/help_feedback/feedback.js
const db = wx.cloud.database();
const app = getApp();

Page({
  data: {
    types: ['功能建议', 'Bug反馈', '体验吐槽'],
    currentType: '功能建议',
    desc: '',
    descLen: 0,
    contact: '',
    images: [], // 存储本地临时路径
    submitting: false
  },

  onLoad() {
    // 自动填入用户信息作为联系方式
    const userInfo = app.globalData.userInfo || {};
    if (userInfo.username) {
      this.setData({ contact: userInfo.username });
    }
  },

  onTypeChange(e) {
    this.setData({ currentType: e.detail.value });
  },

  onDescInput(e) {
    this.setData({ 
      desc: e.detail.value,
      descLen: e.detail.value.length 
    });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  chooseMedia() {
    wx.chooseMedia({
      count: 3 - this.data.images.length,

      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        wx.showLoading({ title: '上传中...' });
        
        const tempFiles = res.tempFiles;
        const uploadPromises = [];

        // 1. 遍历所有选中的图片，逐个上传到云存储
        tempFiles.forEach(file => {
          // 生成一个唯一的文件名，防止覆盖
          const cloudPath = 
          `feedback/${Date.now()}-${Math.random().toString(36).slice(-4)}.jpg`;
          
          const p = new Promise((resolve, reject) => {
            wx.cloud.uploadFile({
              cloudPath: cloudPath,
              filePath: file.tempFilePath,
              success: resolve,
              fail: reject
            });
          });
          uploadPromises.push(p);
        });

        // 2. 等待所有图片上传完成
        Promise.all(uploadPromises).then(results => {
          wx.hideLoading();
          
          // 提取上传成功后的 fileID (即图片的网络地址)
          const newImages = results.map(res => res.fileID);
          
          // 3. 更新数据
          this.setData({
            images: this.data.images.concat(newImages)
          });
          
          console.log('图片已上传，当前列表:', this.data.images);
        }).catch(err => {
          wx.hideLoading();
          console.error('上传失败', err);
          wx.showToast({ title: '上传失败', icon: 'none' });
        });
      }
    });
  },

    // 删除图片
  deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.images;
    
    images.splice(index, 1); // 移除对应索引的图片
    this.setData({
      images: images
    });
  },

  // 预览图片
  previewImage(e) {
    const index = e.currentTarget.dataset.index;
    wx.previewImage({
      current: this.data.images[index],
      urls: this.data.images
    });
  },


  // 提交反馈
  async submitFeedback() {
    if (!this.data.desc.trim()) {
      return wx.showToast({ title: '请填写问题描述', icon: 'none' });
    }

    this.setData({ submitting: true });

    try {
      const imageUrls = this.data.images;
      // 2. 写入数据库
      await db.collection('feedbacks').add({
        data: {
          type: this.data.currentType,
          content: this.data.desc,
          contact: this.data.contact,
          images: imageUrls,
          userId: app.globalData.userInfo?._id || 'unknown',
          createTime: db.serverDate()
        }
      });

      wx.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);

    } catch (err) {
      console.error('提交失败:', err);
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});