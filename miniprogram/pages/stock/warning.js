// pages/stock/warning.js
const app = getApp();

Page({
  data: {
    lowStock: 10,
    maxStock: 100,
    saving: false
  },

  onShow() {
    if (!app.checkLogin()) return;
    this.loadConfig();
  },

  // 通过云函数读取全局预警配置（云函数内做角色校验 + 管理员权限读库）
  loadConfig() {
    wx.cloud.callFunction({
      name: 'updateWarningConfig',
      data: { action: 'get' },
      success: res => {
        const r = res.result || {};
        if (r.success) {
          this.setData({
            lowStock: r.data.lowStock || 10,
            maxStock: r.data.maxStock || 100
          });
        } else {
          // 无权限或读取失败，用默认值并提示
          this.setData({ lowStock: 10, maxStock: 100 });
          if (r.code === 403) {
            wx.showToast({ title: r.message || '无权限查看', icon: 'none' });
          }
        }
      },
      fail: err => {
        console.error('读取预警配置失败', err);
        this.setData({ lowStock: 10, maxStock: 100 });
        wx.showToast({ title: '读取失败', icon: 'none' });
      }
    });
  },

  onLowInput(e) {
    this.setData({ lowStock: e.detail.value });
  },
  onMaxInput(e) {
    this.setData({ maxStock: e.detail.value });
  },

  // 通过云函数保存全局预警配置（云函数内校验角色，非管理员/仓管会被拒绝）
  saveConfig() {
    const lowStock = Number(this.data.lowStock);
    const maxStock = Number(this.data.maxStock);
    if (isNaN(lowStock) || lowStock < 0) {
      wx.showToast({ title: '请输入有效值', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: '保存中...' });

    wx.cloud.callFunction({
      name: 'updateWarningConfig',
      data: {
        action: 'set',
        lowStock: lowStock,
        maxStock: isNaN(maxStock) ? 100 : maxStock
      },
      success: res => {
        wx.hideLoading();
        const r = res.result || {};
        if (r.success) {
          // 同步到全局缓存
          app.globalWarning = {
            lowStock: lowStock,
            maxStock: isNaN(maxStock) ? 100 : maxStock
          };
          wx.showToast({ title: '保存成功', icon: 'success' });
          this.setData({ saving: false });
          setTimeout(() => wx.navigateBack(), 1200);
        } else {
          this.setData({ saving: false });
          wx.showToast({ title: r.message || '保存失败', icon: 'none' });
        }
      },
      fail: err => {
        wx.hideLoading();
        this.setData({ saving: false });
        console.error('保存失败', err);
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  }
});