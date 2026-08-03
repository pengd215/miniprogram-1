// pages/createPart/index.js
const app = getApp();
Page({
  data: {
    formData: {
      oe_no: '',
      car_model: '',    // 修正：与WXML和逻辑保持一致
      brand: '',
      location: '',     // 修正：库位是必填项
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
    if (!data.oe_no || !data.car_model || !data.location||!data.stock) {
      wx.showToast({ title: '请填写必填项(OE/车型/库存/库位)', icon: 'none' });
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

      status: 'pending', // 设置初始状态为 pending (待完善)

      create_time: db.serverDate() // 使用服务器时间
    };
      // B. 流水日志数据 (写入 transaction_logs 集合)
    const logData = {
      type: 'inbound', // 标记为“新建”操作
      oe_no: data.oe_no,
      quantity: initialStock, // 变动数量（即初始库存）
      current_stock: initialStock, // 变动后库存
      _openid: app.globalData.openId, // TODO: 如果有登录系统，这里填用户ID或昵称
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

  submitCreate() {
    const { oe_no, car_model, location, model_year, stock, brand,direction } = this.data.formData;

    // 1. 核心字段校验
    if (!oe_no || !car_model || !location||!stock) {
      wx.showToast({ title: '请填写所有必填项', icon: 'none' });
      return;
    }

    // 2. 数据预处理：格式化年份
    // 将用户输入的 "12-15" 转换为 "2012-2015" 再存入数据库
    const formatYear = (yearStr) => {
      if (!yearStr) return '';
      let str = String(yearStr).trim();
      if (str.includes('-')) {
        const parts = str.split('-');
        const start = parts[0].length === 2 ? '20' + parts[0] : parts[0];
        const end = parts[1].length === 2 ? '20' + parts[1] : parts[1];
        return `${start}-${end}`;
      }
      if (str.length === 2) return '20' + str;
      return str;
    };

    const finalData = {
      oe_no,
      car_model,
      location,
      model_year: formatYear(model_year), // 存入格式化后的年份
      stock: Number(stock) || 0, // 确保库存是数字
      brand,
      created_at: new Date().toISOString() // 记录创建时间
    };

  // 3. 直接写入 products 集合
    db.collection('products').add({
      data: {
        oe_no: oe_no,
        car_model: car_model,   // 注意：数据库里叫 car_model，这里要对应
        brand: brand,
        location: location,
        model_year: finalYear, // 存入格式化后的年份
        stock: parseInt(stock) || 0, // 确保库存是数字
        kyb_no: kyb_no || '',
        direction:direction||'',//方向
        create_time: db.serverDate() // 可选：记录创建时间
      },
      success: res => {
        wx.hideLoading();
        wx.showToast({ title: '建档成功' });
        setTimeout(() => {
          wx.navigateBack(); // 成功后返回上一页
        }, 1500);
      },
      fail: err => {
        wx.hideLoading();
        console.error('建档失败', err);
        wx.showToast({ title: '建档失败，请重试', icon: 'none' });
      }
    });
  }
});