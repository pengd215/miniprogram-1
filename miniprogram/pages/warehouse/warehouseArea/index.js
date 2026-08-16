// pages/warehouse/warehouseArea/index.js
// 库区管理页：定义库区（A区/B区/C区）
const app = getApp();

Page({
  data: {
    warehouses: [],
    loading: false,
    showAdd: false,
    form: { name: '', code: '', desc: '' }
  },

  onShow() {
    if (!app.checkLogin()) return;
    this.loadWarehouses();
  },

  // 加载库区列表
  loadWarehouses() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'warehouseManage',
      data: { action: 'listWarehouses' },
      success: res => {
        this.setData({ loading: false });
        const r = res.result || {};
        if (r.success) {
          this.setData({ warehouses: r.data || [] });
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

  // 打开添加弹窗
  openAdd() {
    this.setData({ showAdd: true, form: { name: '', code: '', desc: '' } });
  },
  closeAdd() {
    this.setData({ showAdd: false });
  },
  // 阻止弹窗内部点击冒泡到遮罩（避免点击输入框时误关弹窗）
  noop() {},
  onNameInput(e) { this.setData({ 'form.name': e.detail.value }); },
  onCodeInput(e) { this.setData({ 'form.code': e.detail.value }); },
  onDescInput(e) { this.setData({ 'form.desc': e.detail.value }); },

  // 提交添加库区
  submitAdd() {
    const { name, code, desc } = this.data.form;
    if (!name.trim() || !code.trim()) {
      wx.showToast({ title: '库区名称和编码不能为空', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '添加中...' });
    wx.cloud.callFunction({
      name: 'warehouseManage',
      data: { action: 'addWarehouse', name: name.trim(), code: code.trim().toUpperCase(), desc: desc.trim() },
      success: res => {
        wx.hideLoading();
        const r = res.result || {};
        if (r.success) {
          wx.showToast({ title: '添加成功', icon: 'success' });
          this.setData({ showAdd: false });
          this.loadWarehouses();
        } else {
          wx.showToast({ title: r.message || '添加失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  // 删除库区
  onDeleteWarehouse(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.showModal({
      title: '确认删除',
      content: `确定删除库区"${name}"吗？其下所有库位将一并删除！`,
      confirmColor: '#e64340',
      success: res => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        wx.cloud.callFunction({
          name: 'warehouseManage',
          data: { action: 'deleteWarehouse', id },
          success: r => {
            wx.hideLoading();
            const rr = r.result || {};
            wx.showToast({ title: rr.success ? '已删除' : rr.message, icon: rr.success ? 'success' : 'none' });
            if (rr.success) this.loadWarehouses();
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '网络异常', icon: 'none' });
          }
        });
      }
    });
  },

  // 进入库位管理
  goToLocations(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name;
    wx.navigateTo({
      url: `/pages/warehouse/locationMgr/index?warehouseId=${id}&name=${name}`
    });
  }
});