// app.js
App({
  globalData: {
    eventChannel: null, //初始化全局事件通道
    openid: '' ,// 初始化为空字符串
    userInfo: null
  },
  // 全局预警配置（缓存，避免每次判断都读库）
  globalWarning: {
    lowStock: 10,   // 默认低库存阈值
    maxStock: 100   // 默认最高积压阈值（可选）
  },

  onLaunch: function () {
    // 1. 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'YOUR_CLOUD_ENV_ID', // 你的环境ID（部署时替换）
        traceUser: true,
      })
    }

    // 2. 【新增代码】获取 OpenID 并赋值给 globalData
    this.getOpenId(); 
  },

  checkLogin(page) {
    const userInfo = wx.getStorageSync('userInfo')
    if (!userInfo || !userInfo._id) {
      wx.reLaunch({ url: '/pages/login/login' })
      return false
    }
    return true
  },

  // 专门用来获取 OpenID
  getOpenId() {
    const that = this;
    wx.cloud.callFunction({
      name: 'userLogin', // 调用云函数 'userlogin' (微信默认自带的获取openid的函数)
      success(res) {
        console.log('获取 OpenID 成功:', res.result.openid);
        // 将获取到的 openid 存入 globalData
        that.globalData.openid = res.result.openid;
      },
      fail(err) {
        console.error('获取 OpenID 失败:', err);
      }
    })
  },
  // 从 settings 集合读取全局预警配置
  loadWarningConfig() {
  const db = wx.cloud.database();
  return db.collection('settings').doc('warning').get()
    .then(res => {
      const d = res.data || {};
      this.globalWarning = {
        lowStock: d.lowStock || 10,
        maxStock: d.maxStock || 100
      };
      return this.globalWarning;
    })
    .catch(() => {
      // 读取失败用默认值
      return this.globalWarning;
    });
  },

// 计算单品的库存状态
// 返回: 'normal' | 'low' | 'out' ，以及对应文案
  getStockStatus(stock, product) {
  // 单品自定义预警值优先
  const warnStock = (product && product.warnStock) || this.globalWarning.lowStock;
  if (stock <= 0) return { status: 'out', text: '缺货', color: 'status-out' };
  if (stock < warnStock) return { status: 'low', text: '紧张', color: 'status-low' };
  return { status: 'normal', text: '充足', color: 'status-in' };
  }
})