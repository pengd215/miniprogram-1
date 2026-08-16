// pages/warehouse/locationMgr/index.js
// 库位管理页：展示库位列表、批量生成库位、扫码绑定商品
const app = getApp();

Page({
  data: {
    warehouseId: '',
    warehouseName: '',
    locations: [],
    loading: false,
    showGen: false,
    genForm: { startRow: '01', endRow: '05', startCol: '01', endCol: '10' },
    prvCount: 0  // 库位前缀计算出的数量预览
  },

  onLoad(options) {
    this.setData({
      warehouseId: options.warehouseId || '',
      warehouseName: options.name || '库位管理'
    });
    wx.setNavigationBarTitle({ title: this.data.warehouseName });
  },

  onShow() {
    if (!app.checkLogin()) return;
    this.loadLocations();
  },

  // 加载库位列表
  loadLocations() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'warehouseManage',
      data: { action: 'listLocations', warehouseId: this.data.warehouseId },
      success: res => {
        this.setData({ loading: false });
        const r = res.result || {};
        if (r.success) {
          this.setData({ locations: r.data || [] });
        } else {
          wx.showToast({ title: r.message || '加载失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  // 打开批量生成弹窗
  openGen() {
    this.setData({ showGen: true });
  },
  closeGen() {
    this.setData({ showGen: false });
  },
  // 阻止弹窗内部点击冒泡到遮罩（避免点击输入框时误关弹窗）
  noop() {},
  onGenInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [`genForm.${key}`]: e.detail.value });
  },

  // 批量生成库位
  submitGen() {
    const p = this.data.genForm;
    const sR = parseInt(p.startRow), eR = parseInt(p.endRow);
    const sC = parseInt(p.startCol), eC = parseInt(p.endCol);
    if (isNaN(sR) || isNaN(eR) || isNaN(sC) || isNaN(eC) || sR > eR || sC > eC) {
      wx.showToast({ title: '行列范围无效', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '生成中...' });
    wx.cloud.callFunction({
      name: 'warehouseManage',
      data: {
        action: 'generateLocations',
        warehouseId: this.data.warehouseId,
        prefix: this.data.warehouseName.replace(/[区\s]/g, '') || 'A',
        startRow: sR, endRow: eR, startCol: sC, endCol: eC
      },
      success: res => {
        wx.hideLoading();
        const r = res.result || {};
        wx.showToast({ title: r.success ? r.message : r.message, icon: r.success ? 'success' : 'none' });
        if (r.success) {
          this.setData({ showGen: false });
          this.loadLocations();
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  // 点击库位 -> 扫码绑定商品
  onTapLocation(e) {
    const location = e.currentTarget.dataset.item;
    wx.showActionSheet({
      itemList: location.status === 'bound' ? ['扫码换绑商品', '解绑'] : ['扫码绑定商品'],
      success: res => {
        if (res.tapIndex === 0) {
          this.scanAndBind(location);
        } else if (res.tapIndex === 1) {
          this.unbind(location);
        }
      }
    });
  },

  // 扫码并绑定
  scanAndBind(location) {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['barCode', 'qrCode'],
      success: res => {
        const barcode = res.result;

        wx.showLoading({ title: '绑定中...' });
        wx.cloud.callFunction({
          name: 'warehouseManage',
          data: { action: 'bindProduct', locationId: location._id, barcode },
          success: r => {
            wx.hideLoading();
            const rr = r.result || {};
            wx.showToast({ title: rr.message || '绑定结果', icon: rr.success ? 'success' : 'none' });
            if (rr.success) this.loadLocations();
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '网络异常', icon: 'none' });
          }
        });
      },
      fail: err => {
        if (err.errMsg && err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '扫码失败', icon: 'none' });
        }
      }
    });
  },

  // 解绑
  unbind(location) {
    wx.showModal({
      title: '确认解绑',
      content: '确定解绑该库位绑定的商品吗？',
      success: res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '解绑中...' });
        wx.cloud.callFunction({
          name: 'warehouseManage',
          data: { action: 'unbindProduct', locationId: location._id },
          success: r => {
            wx.hideLoading();
            const rr = r.result || {};
            wx.showToast({ title: rr.message, icon: rr.success ? 'success' : 'none' });
            if (rr.success) this.loadLocations();
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '网络异常', icon: 'none' });
          }
        });
      }
    });
  }
});