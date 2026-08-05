// pages/personal/personal.js
const app = getApp();
const db = wx.cloud.database();
Page({
  data: {
    userName: '',
    userId: '',
    roleText: '',
    userRole: '',
    menuGroups: [], // 动态菜单列表
    avatarUrl: ''
  },

  onLoad() {
    this.initUserInfo();// 首次加载用户信息
    this.renderMenuByRole();// 初始化菜单

       // 监听头像更新事件
    try {
      const eventChannel = this.getOpenerEventChannel?.();
      if (eventChannel) {
        eventChannel.on('avatarUpdated', (data) => {
          console.log('收到头像更新通知:', data);
          // 更新全局数据
          app.globalData.userInfo.avatarUrl = data.avatarUrl;
          // 刷新页面
          this.setData({
            avatarUrl: data.avatarUrl
          });
        });
      }
    } catch (e) {
      console.log('eventChannel 不支持:', e);
    }
  },
  // 每次页面显示时检查是否需要刷新
  onShow() {
    if (app.globalData.eventChannel) {
      this.initUserInfo(); // 重新加载用户信息
      app.globalData.eventChannel = false; // 重置标志
    }
  },

  // 1. 初始化用户信息
  initUserInfo() {
    wx.showLoading({ title: '加载中...' });

    wx.cloud.callFunction({
      name: 'userLogin', // 获取当前用户的 openid
      success: res => {
        const openid = res.result.openid;
        
        // 实时查询数据库，获取最新资料
        db.collection('employees')
          .where({ _openid: openid })
          .get()
          .then(dbRes => {
            wx.hideLoading();
            if (dbRes.data.length > 0) {
              const latestUserData = dbRes.data[0];
              
              // 1. 同步更新全局缓存（确保其他页面也能拿到最新数据）
              app.globalData.userInfo = latestUserData;
              this.setData({
                userName: latestUserData.name || '微信用户',
                userId: latestUserData._id || '暂无',
                userRole: latestUserData.role || 'employee',
                roleText: this.getRoleText(latestUserData.role),
                avatarUrl: latestUserData.avatarUrl || '' // 实时拉取最新头像
              });
              app.globalData.userInfo = latestUserData;
              this.renderMenuByRole();
              // 3. 如果角色发生变化，需要重新渲染菜单
              if (this.data.userRole !== latestUserData.role) {
                this.renderMenuByRole();
              }
            } else {
              wx.showToast({ title: '未找到用户信息', icon: 'none' });
            }
          })
          .catch(err => {
            wx.hideLoading();
            console.error("拉取用户信息失败", err);
            wx.showToast({ title: '数据加载失败', icon: 'none' });
          });
      },
      fail: err => {
        wx.hideLoading();
        console.error("登录校验失败", err);
      }
    });
  },

  // 2. 根据角色渲染菜单（核心权限控制）
  renderMenuByRole() {
    const role = this.data.userRole; 
  const userName = this.data.userName; 
  const userInfo = app.globalData.userInfo || {};

  console.log('当前用户:', userName, '角色:', role);

    let groups = [];

    if (role === 'admin') {
      // --- 管理员看到的菜单 ---
      groups = [
        {
          groupTitle: '账户服务',
          groupEn: 'ACCOUNT SERVICE',
          items: [
            { name: '账户设置', desc: '个人资料与账户信息', url: '/pages/account_setting/setting' },
            { name: '管理权限', desc: '管理员权限设置', url: '/pages/employee/permission' }
          ]
        },
        {
          groupTitle: '仓库管理',
          groupEn: 'WAREHOUSE MANAGEMENT',
          items: [
            { name: '仓库管理', desc: '仓库资料与成员配置', url: '/pages/employee/list' },
            { name: '库存预警', desc: '查看低库存与异常提醒', url: '/pages/stock/warning' }
          ]
        },
        {
          groupTitle: '帮助与支持',
          groupEn: 'HELP & SUPPORT',
          items: [
            { name: '功能吐槽', desc: '和开发者互动', url: '/pages/help_feedback/feedback' }
          ]
        }
      ];
    } 
      else if(role === 'sales') {
      // --- 业务员看到的菜单 ---
      groups = [
        {
          groupTitle: '账户服务',
          groupEn: 'ACCOUNT SERVICE',
          items: [
            { name: '账户设置', desc: '个人资料与账户信息', url: '/pages/account_setting/setting' }
          ]
        },
        {
          groupTitle: '仓库管理',
          groupEn: 'WAREHOUSE MANAGEMENT',
          items: [
            { name: '仓库管理', desc: '仓库资料与成员配置', url: '/pages/employee/list' }
          ]
        },
        {
          groupTitle: '帮助与支持',
          groupEn: 'HELP & SUPPORT',
          items: [
            { name: '功能吐槽', desc: '和开发者互动', url: '/pages/help_feedback/feedback' }
          ]
        }
      ];
    }
     else if(role === 'worker') {
      // --- 普通员工看到的菜单 ---
      groups = [
        {
          groupTitle: '账户服务',
          groupEn: 'ACCOUNT SERVICE',
          items: [
            { name: '账户设置', desc: '个人资料与账户信息', url: '/pages/account_setting/setting' }
          ]
        },
        {
          groupTitle: '仓库管理',
          groupEn: 'WAREHOUSE MANAGEMENT',
          items: [
            { name: '仓库管理', desc: '仓库资料与成员配置', url: '/pages/employee/list' }
          ]
        },
        {
          groupTitle: '帮助与支持',
          groupEn: 'HELP & SUPPORT',
          items: [
            { name: '功能吐槽', desc: '和开发者互动', url: '/pages/help_feedback/feedback' }
          ]
        }
      ];
    }
    else if(role === 'warehouse_manager') {
      // --- 仓管菜单 ---
      groups = [
        {
          groupTitle: '账户服务',
          groupEn: 'ACCOUNT SERVICE',
          items: [
            { name: '账户设置', desc: '个人资料与账户信息', url: '/pages/account_setting/setting' }
          ]
        },
        {
          groupTitle: '仓库管理',
          groupEn: 'WAREHOUSE MANAGEMENT',
          items: [
            { name: '仓库管理', desc: '仓库资料与成员配置', url: '/pages/employee/list' },
            { name: '库存预警', desc: '查看低库存与异常提醒', url: '/pages/stock/warning' }
          ]
        },
        {
          groupTitle: '帮助与支持',
          groupEn: 'HELP & SUPPORT',
          items: [
            { name: '功能吐槽', desc: '和开发者互动', url: '/pages/help_feedback/feedback' }
          ]
        }
      ];
    }


    this.setData({ 
      userName: userName,
      userRole: role,
      userId: userInfo._id || userInfo.openid || '暂无',
      roleText: this.getRoleText(role),
      menuGroups: groups
    });
  },
    getRoleText(role) {
      const roleMap = {
      'admin': '管理员',
      'worker': '普通员工',
      'sales': '业务员',
      'warehouse_manager': '仓管'
      };
      return roleMap[role] || '未知角色';
    },


   // 通用页面跳转函数
  navigateTo(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.navigateTo({
        url: url,
        fail: () => {
          wx.showToast({ title: '页面正在开发中', icon: 'none' });
        }
      });
    }
  },

  // 退出登录逻辑
  handleLogout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出当前账号吗？',
      confirmColor: '#ff4d4f', // 确认按钮红色，警示作用
      success: (res) => {
        if (res.confirm) {
          this.performLogout();
        }
      }
    });
  },

  // 执行退出操作
  performLogout() {
    wx.showLoading({ title: '退出中...' });

    // 1. 清除本地缓存 (Token, UserInfo等)
    wx.clearStorageSync(); 

    // 模拟网络请求延迟（可选）
    setTimeout(() => {
      wx.hideLoading();
      
      // 2. 提示成功
      wx.showToast({
        title: '已退出',
        icon: 'success'
      });

      // 3. 跳转回登录页 (使用 reLaunch 清空页面栈)
      setTimeout(() => {
        wx.reLaunch({
          url: '/pages/login/login' 
        });
      }, 1500);
      
    }, 800);
  }
})