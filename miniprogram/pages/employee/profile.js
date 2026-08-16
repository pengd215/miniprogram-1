// pages/employee/profile.js
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

  onShow(){

    if (!app.checkLogin()) return;  // 未登录直接回登录页
    this.initUserInfo(); // 每次页面显示时重新加载用户信息（确保切换账号后数据最新）
  },

  navigateTo(e) {
    const url = e.currentTarget.dataset.url;
    if (url) {
      wx.navigateTo({ url });
    }
  },

  onLoad() {
    this.initUserInfo();// 首次加载用户信息

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

  // 1. 初始化用户信息
  initUserInfo() {
    // 直接从登录时存好的全局变量/缓存读取，不再绕云函数
    const userInfo = app.globalData.userInfo || {};
    const userRole = userInfo.role || wx.getStorageSync('userRole') || '';
    const userName = userInfo.name || wx.getStorageSync('userName') || '微信用户';

    console.log('【个人中心】当前用户:', userName, '角色:', userRole);

    this.setData({
      userName: userName,
      userId: userInfo._id || '暂无',
      userRole: userRole,
      roleText: this.getRoleText(userRole),
      avatarUrl: userInfo.avatarUrl || ''
    });

    // 根据角色渲染菜单
    this.renderMenuByRole();
  },

  // 2. 根据角色渲染菜单（核心权限控制）
  renderMenuByRole() {
    const role = this.data.userRole; 
  const userName = this.data.userName; 
  const userInfo = app.globalData.userInfo || {};

  console.log('当前用户:', userName,'角色:', role);

    let groups = [];

    if (role === 'admin') {
      // --- 管理员看到的菜单 ---
      groups = [
        {
          groupTitle: '账户服务',
          groupEn: 'ACCOUNT SERVICE',
          items: [
            { name: '账户设置', desc: '个人资料与账户信息', url: '/pages/account_setting/setting' },
            { name: '管理权限', desc: '管理员权限设置', url: '/pages/permission/index' }
          ]
        },
        {
          groupTitle: '仓库管理',
          groupEn: 'WAREHOUSE MANAGEMENT',
          items: [
            { name: '库区库位管理', desc: '库区定义与库位配置', url: '/pages/warehouse/warehouseArea/index' },
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
            { name: '库区库位管理', desc: '库区定义与库位配置', url: '/pages/warehouse/warehouseArea/index' }
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
            { name: '库区库位管理', desc: '库区定义与库位配置', url: '/pages/warehouse/warehouseArea/index' }
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
            { name: '库区库位管理', desc: '库区定义与库位配置', url: '/pages/warehouse/warehouseArea/index' },
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
      'warehouse_manager': '仓管',
      'customer': '客户'
      };
      return roleMap[role] || '未知角色';
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