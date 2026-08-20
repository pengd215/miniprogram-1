// account-settings.js
const db = wx.cloud.database(); // 初始化数据库引用
const app = getApp(); // 获取全局App实例

Page({
  data: {
    nickName: '微信用户',  // 昵称
    name: '',      // 姓名
    bio: '',       // 简介
    gender: 0,     // 性别代码 0:未选 1:男 2:女
    genderText: '请选择',
    isSaving: false // 防止重复点击保存
  },

  onLoad() {
    this.loadUserInfo();
  },

  // 1. 从云端加载最新数据
  loadUserInfo() {
    wx.showLoading({ title: '加载中...' });

    wx.cloud.callFunction({
      name: 'userLogin',
      success: res => {
        const openid = res.result.openid;

        db.collection('employees')
          .where({ _openid: openid })
          .get()
          .then(res => {
            wx.hideLoading();
            if (res.data.length > 0) {
              const userData = res.data[0];
              this.setData({
                name: userData.name || '',
                bio: userData.bio || '',
                gender: userData.gender || 0,
                genderText: userData.gender === 1 ? '男' : (userData.gender === 2 ? '女' : '请选择'),
                nickName: userData.nickName || '微信用户'
              });
            }
          })
          .catch(err => {
            console.error("加载失败", err);
            wx.hideLoading();
          });
      }
    });
  },

  // 2. 姓名输入监听
  onNameInput(e) {
    this.setData({
      'name': e.detail.value
    });
  },

  // 3. 性别选择
  showGenderPicker() {
    wx.showActionSheet({
      itemList: ['男', '女'],
      success: (res) => {
        if (res.tapIndex !== undefined) {
          const genderMap = ['男', '女'];
          const genderValueMap = [1, 2];
          this.setData({
            genderText: genderMap[res.tapIndex],
            gender: genderValueMap[res.tapIndex]
          });
        }
      }
    });
  },

  // 4. 简介输入监听
  onBioInput(e) {
    const value = e.detail.value;
    this.setData({
      bio: value
    });
  },

  // 5. 保存修改
  handleSave() {
    if (this.data.isSaving) return;

    const { name, bio, gender } = this.data;

    if (!name || name.trim() === '') {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }

    this.setData({ isSaving: true });
    wx.showLoading({ title: '保存中...' });

    wx.cloud.callFunction({
      name: 'userLogin',
      success: res => {
        const openid = res.result.openid;

        db.collection('employees')
          .where({
            _openid: openid
          })
          .update({
            data: {
              name: name,
              gender: gender,
              bio: bio,
              updatedAt: db.serverDate()
            },
            success: () => {
              wx.hideLoading();
              this.setData({ isSaving: false });

              // 触发个人中心刷新
              app.globalData.userInfoChanged = true;

              wx.showToast({
                title: '保存成功',
                icon: 'success'
              });

              setTimeout(() => {
                wx.navigateBack();
              }, 1500);
            },
            fail: err => {
              console.error("更新失败", err);
              wx.hideLoading();
              this.setData({ isSaving: false });
              wx.showToast({ title: '保存失败，请重试', icon: 'none' });
              let msg = '保存失败';
              if (err.errMsg.includes('performed without permission')) {
                msg = '权限不足：请在云开发控制台开启 employees 集合的写入权限';
              } else if (err.errMsg.includes('not found')) {
                msg = '未找到记录：请先注册或检查集合名';
              }
              wx.showToast({ title: msg, icon: 'none', duration: 3000 });
            }
          });
      },
      fail: err => {
        console.error("获取OpenID失败", err);
        wx.hideLoading();
        this.setData({ isSaving: false });
        wx.showToast({ title: '登录状态失效', icon: 'none' });
      }
    });
  }
});