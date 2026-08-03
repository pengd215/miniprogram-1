// pages/account_setting/account_setting.js
const db = wx.cloud.database();
const app = getApp();

Page({
  data: {
    userInfo: {},
    showEditDialog: false,
    editType: '', // 标记当前正在修改哪个字段: 'name', 'bio', 'gender'
    editValue: '' // 弹窗输入框的值
  },

  onLoad() {
    this.loadUserInfo();
  },

  // 1. 从数据库加载用户信息
  loadUserInfo() {
    const userId = app.globalData.userInfo?._id;
    if (!userId){
      console.warn('未获取到用户ID，请检查登录状态');
     return;
     }

    db.collection('employees').doc(userId).get().then(res => {
      this.setData({
        userInfo: res.data
      });
    }).catch(err => {
      console.error('获取用户信息失败', err);
    });
  },

  // 2. 点击修改项，打开弹窗
  onEditField(type) {
    const currentVal = this.data.userInfo[type] || '';
    this.setData({
      editType: type,
      editValue: currentVal,
      showEditDialog: true
    });
  },

  onEditname() { this.onEditField('name'); },
  onEditBio() { this.onEditField('bio'); },
  
  // 性别特殊处理，通常用选择器而不是输入框，这里简化为输入演示
  onEditGender() { 
    wx.showActionSheet({
      itemList: ['男', '女', '保密'],
      success: (res) => {
        const genderMap = {'男': 1, '女': 2, '保密': 0};
        const text = res.tapIndex === 0 ? '男' : (res.tapIndex === 1 ? '女' : '保密');
        this.updateUserInfo('gender', genderMap[text], 'genderText', text);
      }
    });
  },

  // 3. 确认修改，更新数据库
  async onConfirmEdit() {
    if (!this.data.editValue.trim()) {
      return wx.showToast({ title: '内容不能为空', icon: 'none' });
    }

    const { editType, editValue } = this.data;
    
    try {
      await db.collection('employees').doc(app.globalData.userInfo._id).update({
        data: { [editType]: editValue }
      });

      wx.showToast({ title: '修改成功', icon: 'success' });
      
      // 更新本地显示
      this.setData({
        [`userInfo.${editType}`]: editValue,
        showEditDialog: false
      });
      
      // 同步更新全局缓存（可选）
      app.globalData.userInfo[editType] = editValue;
      
    } catch (err) {
      console.error('更新失败', err);
      wx.showToast({ title: '修改失败', icon: 'none' });
    }
  },

  onLogout() {
    wx.clearStorageSync();
    wx.reLaunch({ url: '/pages/login/login' });
  }
});