// pages/inbound/inbound.js
Page({
  data: {
    oe_no: '',      // OE码/编号
    kybNo: '',       // 【新增】KYB编号
    modelName: '',
    quantity: '',    // 入库数量
    remark: '',      // 备注信息
    submitting: false // 防止重复点击
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
    if (options.data) {
      try {
        const params = JSON.parse(decodeURIComponent(options.data));
        console.log('接收到的入库数据:', params);
        
        // 自动填入数据
        this.setData({ 
          oe_no: params.oe_no || params.oeCode || '',
          modelName: params.model || params.modelName || '未知配件',
        });
      } catch (e) {
        console.error('解析参数失败', e);
      }
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
    const { oe_no, kybNo, quantity, remark,submitting } = this.data;

    // --- 表单校验 ---
    // 允许只填 OE 或只填 KYB，只要有一个就行
    if (!oe_no && !kybNo) {
      return wx.showToast({ title: '请输入OE码或KYB号', icon: 'none' });
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
        oe_no: oe_no,      
        kyb_no: kybNo,       // 【关键修改】把 KYB 号传给后端
        quantity: Number(quantity), 
        remark: remark || '无备注'
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