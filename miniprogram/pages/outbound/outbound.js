// pages/outbound/outbound.js
Page({
  data: {
    oe_no: '',
    kybNo: '',
    modelName: '',
    stock: 0,
    quantity: '',
    remark: '',
    submitting: false,
    maxQuantity: 0,  // 当前最大可出库数量
    productId:null
  },

  onLoad(options) {
    // 接收从查询页传来的数据
    if (!options.id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return wx.navigateBack();
    }
    
    const productId = options.id;
    this.setData({ productId });
    this.loadProductData(productId); // 加载产品数据（含当前库存）
  },

  // 【核心】加载产品数据（含库存）
  async loadProductData(id) {
    wx.showLoading({ title: '加载中...' });
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'getProductById',
        data: { id }
      });
      
      if (res.result.code === 200 && res.result.data) {
        const product = res.result.data;
        this.setData({
          oe_no: product.oe_no || '无',
          kybNo: product.kyb_no || '',
          modelName: product.car_model || product.name || '未知配件',
          maxQuantity: product.stock || 0 // 关键：记录当前库存
        });
        
        // 自动填充最大可出库数量提示
        if (product.stock > 0) {
          wx.showToast({ 
            title: `当前库存: ${product.stock}`, 
            icon: 'none',
            duration: 2000
          });
        } else {
          wx.showToast({ 
            title: '库存为0，无法出库', 
            icon: 'none' 
          });
        }
      } else {
        throw new Error(res.result.message || '产品数据加载失败');
      }
    } catch (err) {
      wx.showToast({ title: `错误: ${err.message}`, icon: 'none' });
      this.setData({ productId: null });
    } finally {
      wx.hideLoading();
    }
  },
//监听OE码输入
  onOeInput(e) {
    this.setData({ oe_no: e.detail.value });
  },

  // 扫码功能
  handleScan() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        this.setData({ oe_no: res.result });
      },
      fail: (err) => {
        console.log('扫码取消或失败', err);
      }
    });
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
    const { quantity, remark, submitting,  maxQuantity, productId } = this.data;

    if (!productId) {
      return wx.showToast({ title: '缺少产品信息，请重新进入', icon: 'none' });
    }
    if (!quantity || Number(quantity) <= 0) {
      return wx.showToast({ title: '请输入有效数量', icon: 'none' });
    }
    if (Number(quantity) > maxQuantity) {
      return wx.showToast({ title: `出库数量不能大于库存(${maxQuantity})`, icon: 'none' });
    }
    if (submitting) return;

    this.setData({ submitting: true });
    wx.showLoading({ title: '出库中...' });

    // 调用云函数
    wx.cloud.callFunction({
      name: 'submitOutbound',
      data: {
        productId: productId,
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
