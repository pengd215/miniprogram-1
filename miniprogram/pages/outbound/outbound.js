// pages/outbound/outbound.js
Page({
  data: {
    oe_no: '',
    kybNo: '',
    modelName: '',
    stock: 0,
    quantity: '',
    remark: '',
    submitting: false
  },

  onLoad(options) {
    // 接收从查询页传来的数据
    if (options.data) {
      try {
        const params = JSON.parse(decodeURIComponent(options.data));
        console.log('出库页接收数据:', params);
        // 自动填入数据
        this.setData({
          oe_no: params.oe_no || params.oeCode || '',
          modelName: params.model || params.modelName || '未知配件',
          stock: params.stock || 0
        });
      } catch (e) {
        console.error('解析参数失败', e);
        wx.showToast({ title: '数据加载失败', icon: 'none' });
      }
    }
  },


  // 监听数量输入
  onQuantityInput(e) {
    this.setData({ quantity: e.detail.value });
  },

  // 监听备注输入
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // 提交出库
  confirmOutbound() {
    const { oe_no, kybNo, quantity, remark, submitting, stock } = this.data;

    if (!oe_no && !kybNo) {
      return wx.showToast({ title: '缺少零件信息', icon: 'none' });
    }
    if (!quantity || Number(quantity) <= 0) {
      return wx.showToast({ title: '请输入有效数量', icon: 'none' });
    }
    if (Number(quantity) > stock) {
      return wx.showToast({ title: '出库数量不能大于库存', icon: 'none' });
    }
    if (submitting) return;

    this.setData({ submitting: true });
    wx.showLoading({ title: '出库中...' });

    // 调用云函数
    wx.cloud.callFunction({
      name: 'submitOutbound',
      data: {
        oe_no: oe_no,
        kyb_no: kybNo,
        quantity: Number(quantity),
        remark: remark || '无备注'
      },
      success: res => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showToast({ title: '出库成功', icon: 'success' });
          setTimeout(() => wx.navigateBack(), 1500);
        } else {
          wx.showToast({ title: res.result.message || '出库失败', icon: 'none' });
          this.setData({ submitting: false });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error(err);
        wx.showToast({ title: '网络异常', icon: 'none' });
        this.setData({ submitting: false });
      }
    });
  }
});