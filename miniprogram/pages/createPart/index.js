// pages/createPart/index.js
const app = getApp();
Page({
  data: {
    formData: {
      oe_no: '',
      car_model: '',    // 修正：与WXML和逻辑保持一致
      brand: '',
      location: '',    
      model_year: '',   // 修正：年份字段
      kyb_no: '',
      direction:'',//方向
      stock: '',
      images: [] // 添加 images 字段，默认为空数组
    },
    isSubmitting: false // 防止重复点击
  },

  onLoad(options) {
    // 接收首页跳转过来的 OE 编号
    if (options.oe_no) {
      this.setData({
        'formData.oe_no': options.oe_no
      });
    }
  },

  // 通用的表单输入处理函数
  onInput(e) {
    const { key } = e.currentTarget.dataset; // 从 data-key 获取字段名
    this.setData({
      [`formData.${key}`]: e.detail.value
    });
  },

  /* 提交建档并记录流水*/
  handleSubmit() {
    const data = this.data.formData;
    const initialStock = Number(data.stock) || 0;
    const db = wx.cloud.database();
    if (this.data.isSubmitting) return; // 防止重复提交

    // 1. 基础校验
    if (!data.oe_no || !data.car_model ||!data.stock) {
      wx.showToast({ title: '请填写必填项(OE/车型/库存)', icon: 'none' });
      return;
    }

    this.setData({ isSubmitting: true });
    wx.showLoading({ title: '建档入库中...' });

      // 2. 获取当前时间（用于流水记录）
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()} ${now.getHours()}:${now.getMinutes()}`;

    // 3. 准备两条数据
    // A. 配件档案数据
    const productData = {
      oe_no: data.oe_no,
      car_model: data.car_model,
      model_year: data.model_year || '',
      direction: data.direction || '',
      location: data.location,
      kyb_no: data.kyb_no || '',
      quantity: initialStock, // 确保是数字
      stock: initialStock,
      price: Number(data.price) || 0, // 确保是数字
      remark: this.data.formData.remark || '',
      status: 'pending', // 设置初始状态为 pending (待完善)

      create_time: db.serverDate() // 使用服务器时间
    };
      // B. 流水日志数据 (写入 transaction_logs 集合)
    const logData = {
      type: 'inbound', // 标记为“新建”操作
      oe_no: data.oe_no,
      quantity: initialStock, // 变动数量（即初始库存）
      current_stock: initialStock, // 变动后库存
      _openid: app.globalData.openid,
      remark: `新建：${data.car_model} `,
      create_time: db.serverDate()
    };
      // 4. 并行写入数据库
    Promise.all([
      db.collection('products').add({ data: productData }),
      db.collection('transaction_logs').add({ data: logData })
    ])
    .then(res => {
      console.log('保存成功', res);
      wx.hideLoading();
      wx.showToast({ title: '建档成功', icon: 'success' });
      
      // 5. 延迟返回上一页，让用户看到成功提示
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    })
    .catch(err => {
      console.error('保存失败', err);
      wx.hideLoading();
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
    })
    .finally(() => {
      this.setData({ isSubmitting: false });
    });
  },

});