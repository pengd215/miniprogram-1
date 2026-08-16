// pages/inbound/inbound.js
const db = wx.cloud.database();
Page({
  data: {
    oe_no: '',      // OE码/编号
    kybNo: '',       // 【新增】KYB编号
    modelName: '',
    quantity: '',    // 入库数量
    remark: '',      // 备注信息
    submitting: false, // 防止重复点击
    productId:null    //用来存储产品唯一ID
  },

  // 1. 监听 OE码 输入
  onOeCodeInput(e) {
    this.setData({ oe_no: e.detail.value });
  },

  // 2. 监听 KYB号 输入 (如果有这个输入框的话)
  onKybNoInput(e) {
    this.setData({ kybNo: e.detail.value });
  },

  // 3. 监听 数量 输入
  onQuantityInput(e) {
    this.setData({ quantity: e.detail.value });
  },

  // 4. 监听 备注 输入
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  // 页面加载：接收扫码或跳转传来的参数
  onLoad(options) {
    if (options.id) {
      const productId = options.id;
      this.setData({ productId }); // 存储唯一ID
      this.loadProductData(productId); // 用 _id 拉取数据
      return;
    }

    // 2. 兼容旧逻辑：处理首页传递的完整对象（临时过渡）
    if (options.data) {
      try {
        const params = JSON.parse(decodeURIComponent(options.data));
        console.log('接收到的旧版参数:', params);
        
        this.setData({ 
          oe_no: params.oe_no || params.oeCode || '',
          kybNo: params.kyb_no || '',
          modelName: params.car_model || params.modelName || '未知配件',
          productId: params._id // 从对象中提取 _id
        });
      } catch (e) {
        console.error('解析旧参数失败', e);
      }
    }
  },

          // 用 _id 替代 OE 号获取产品数据
  async loadProductData(id) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'getProductById', 
        data: { id }
      });
      
      if (res.result.code === 200 && res.result.data) {
        const product = res.result.data;
        // 仅更新显示字段（保持字段名与原逻辑一致）
        this.setData({
          oe_no: product.oe_no || '无',  
          kybNo: product.kyb_no || '',
          modelName: product.name || '未知配件'
        });
      } else {
        throw new Error(res.result.message || '产品不存在');
      }
    } catch (err) {
      wx.showToast({ 
        title: `加载失败: ${err.message}`, 
        icon: 'none' 
      });
      // 清空无效ID
      this.setData({ productId: null });
    }
  },



  // 5. 核心功能：点击“扫一扫”
  onScanCode() {
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['barCode', 'qrCode'],
      success: (res) => {
        console.log('扫码结果:', res.result);
        // 假设扫出来的是 OE 码
        this.setData({ oe_no: res.result });
        wx.showToast({ title: '识别成功', icon: 'success' });
      },
      fail: (err) => {
        if (err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({ title: '扫码失败', icon: 'none' });
        }
      }
    });
  },

  // 6. 核心功能：点击“确认入库”
  confirmInbound() {
    const { productId, quantity, remark,submitting } = this.data;

    // --- 表单校验 ---
    if (!productId) {
      return wx.showToast({ title: '产品ID缺失，请从首页进入', icon: 'none' });
    }
    if (!quantity || Number(quantity) <= 0) {
      return wx.showToast({ title: '请输入有效的入库数量', icon: 'none' });
    }

    // 防止重复提交
    if (submitting) return;

    this.setData({ submitting: true });
    wx.showLoading({ title: '入库中...' });

    // --- 调用云函数 ---
    wx.cloud.callFunction({
      name: 'submitInbound', 
      data: {
        productId:productId,       //_id 定位产品
        quantity: Number(quantity), 
        remark: remark || '暂无备注'
      },
      success: res => {
        wx.hideLoading();
        console.log('入库结果:', res.result);

        if (res.result && res.result.success) {
          wx.showToast({ title: '入库成功', icon: 'success' });
          // 清空表单
          this.setData({
            oe_no: '',
            kybNo: '',
            quantity: '',
            remark: '',
            submitting: false
          });
        } else {
          // 业务逻辑错误（例如云函数里判断出错了）
          wx.showToast({
            title: res.result.message || '入库失败',
            icon: 'none'
          });
          this.setData({ submitting: false });
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('调用云函数失败:', err);
        wx.showToast({
          title: '网络异常，请重试',
          icon: 'none'
        });
        this.setData({ submitting: false });
      }
    });
  }
})