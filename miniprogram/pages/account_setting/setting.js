// account-settings.js
const db = wx.cloud.database();// 初始化数据库引用
const app = getApp(); // 获取全局App实例
Page({
  data: {
    avatarUrl: '', // 头像路径
    nickName: '微信用户',  // 昵称
    name: '',      // 姓名
    bio: '',       // 简介
    gender: 0,     // 性别代码 0:未选 1:男 2:女
    genderText: '请选择', 
    isSaving: false// 防止重复点击保存
  },

  onLoad() {
    // 可以在这里加载用户已有的数据
    this.loadUserInfo();
  },
// 1. 从云端加载最新数据
  loadUserInfo() {
    wx.showLoading({ title: '加载中...' });
    
    // 获取当前用户的 OpenID (用于查询)
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
                // 如果数据库里有存头像昵称，也可以一并回显
                avatarUrl: userData.avatarUrl || '/images/icons/avatar.png',
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

        // 1. 选择头像并上传
  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '上传中...' });

        // 上传到云存储
        wx.cloud.uploadFile({
          cloudPath: `avatars/${Date.now()}.png`,
          filePath: tempFilePath,
          success: uploadRes => {
            const newAvatarUrl = uploadRes.fileID;

            // 获取当前用户的 openid 用于更新数据库
            wx.cloud.callFunction({
              name: 'userLogin',
              success: res => {
                const openid = res.result.openid;

                // 将新头像链接保存到云数据库
                db.collection('employees').where({
                  _openid: openid
                }).update({
                  data: {
                    avatarUrl: newAvatarUrl
                  }
                }).then(updateRes => {
                  wx.hideLoading();

                  // 更新页面显示
                  this.setData({
                    avatarUrl: newAvatarUrl
                  });

                  // 🔑 通知个人中心：头像已更新，返回时自动刷新
                  // 通知个人中心：头像已更新，返回时自动刷新

                  wx.showToast({
                    title: '头像更新成功',
                    icon: 'success',
                    duration: 1500
                  });
                }).catch(err => {
                  wx.hideLoading();
                  console.error("更新数据库失败", err);
                  wx.showToast({ title: '保存失败', icon: 'none' });
                });
              },
              fail: err => {
                wx.hideLoading();
                console.error("获取openid失败", err);
                wx.showToast({ title: '获取用户信息失败', icon: 'none' });
              }
            });
          },
          fail: err => {
            wx.hideLoading();
            console.error("上传失败", err);
            wx.showToast({ title: '上传失败', icon: 'none' });
          }
        });
      },
      fail: err => {
        console.error("选择图片失败", err);
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
      const genderValueMap = [1, 2]; // 假设 1是男，2是女
      this.setData({
        genderText: genderMap[res.tapIndex],
        gender: genderValueMap[res.tapIndex]
        });
        }
      }
      })
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
    if (this.data.isSaving) return; // 防止重复提交
    
    const { name, bio, gender,avatarUrl } = this.data;
    
    // 简单校验
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

        // 执行数据库更新
        db.collection('employees') 
          .where({
            _openid: openid // 根据 openid 查找当前用户的记录
          })
          .update({
            data: {
              name: name,       // 更新姓名
              gender: gender,   // 更新性别
              bio: bio,         // 更新简介
              avatarUrl: avatarUrl, // 将头像URL存入数据库
              updatedAt: db.serverDate() // 顺便记录更新时间
            },
            success: () => {
              wx.hideLoading();
              this.setData({ isSaving: false });

              if (app.globalData.userInfo) {
                app.globalData.userInfo.avatarUrl = avatarUrl; // 确保这里的 uploadRes.fileID 是最新头像的 CloudID
              }
            
              // 触发个人中心刷新
              app.globalData.userInfoChanged = true;
              
              wx.showToast({
                title: '保存成功',
                icon: 'success'
              });

              // 延迟返回上一页
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
        wx.showToast({ title: '登录状态失效', 
        icon: 'none'    
      });
      }
    });
  }
})
