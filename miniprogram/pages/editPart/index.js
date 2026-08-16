// pages/editPart/index.js
const db = wx.cloud.database();

Page({
  data: {
    id: '', // 数据库记录的唯一ID
    formData: {
      oe_no: '',
      car_model: '',
      model_year: '',
      direction: '',
      location: '',
      kyb_no: '',
      stock: 0,
      price: 0,
      remark:'',
     // isReadOnlyStock: false,//
      images: [],// 初始化图片数组
      brand: '',
      warnStock: ''
    },
    isSaving: false
  },

  onLoad(options) {
    // 1. 获取从 pending 页面传过来的 ID
    if (options.id) {
      this.setData({ id: options.id});
      this.loadDetail(options.id);
    } else {
      wx.showToast({ title: '缺少配件ID', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  // 2. 加载旧数据并回显
  loadDetail(id) {
    wx.showLoading({ title: '加载中...' });
    db.collection('products').doc(id).get().then(res => {
      const data = res.data;
      this.setData({
        formData: {
          oe_no: data.oe_no || '',
          car_model: data.car_model || '',
          model_year: data.model_year || '',
          direction: data.direction || '',
          location: data.location || '',
          kyb_no: data.kyb_no || '',
          stock: data.stock || 0,
          price: data.price || 0,
          brand: data.brand || '',
          images:data.images|| [],
          remark: res.data.remark || '',
          warnStock: data.warnStock || ''
        }
      });
      wx.hideLoading();
    }).catch(err => {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },
  // 1. 选择图片
  chooseImage() {
    wx.chooseMedia({
      count: 3 - this.data.formData.images.length, // 剩余可传数量
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFiles = res.tempFiles;
        this.uploadImages(tempFiles);
      }
    })
  },
  // 2. 上传图片到云存储 
  uploadImages(tempFiles) {
    wx.showLoading({ title: '上传中...' });
    
    const uploadTasks = tempFiles.map(file => {
      // 定义云存储路径：images/时间戳_随机数.jpg
      const cloudPath = `products/${Date.now()}_${Math.random()}.jpg`;
      
      return wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: file.tempFilePath
      }).then(res => res.fileID); // 返回 fileID
    });

    Promise.all(uploadTasks).then(fileIDs => {
      // 将新图片追加到旧图片数组中
      const newImages = [...this.data.formData.images, ...fileIDs];
      this.setData({
        'formData.images': newImages
      });
      wx.hideLoading();
      wx.showToast({ title: '添加成功', icon: 'none' });
    }).catch(err => {
      console.error(err);
      wx.hideLoading();
      wx.showToast({ title: '上传失败', icon: 'none' });
    });
  },

  // 3. 删除图片
  deleteImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.formData.images;
    images.splice(index, 1);
    this.setData({ 'formData.images': images });
  },

  // 3. 通用输入处理
  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({
      [`formData.${key}`]: e.detail.value
    });
  },

  // 4. 保存补全信息 
  handleSubmit() {
    if (this.data.isSaving) return;
    
    const { id, formData } = this.data;
    console.log('提交的数据:', JSON.stringify(formData));
    console.log('记录ID:', id);

    // OE号是核心标识，补全时不能为空
    if (!formData.oe_no ) {
      wx.showToast({ title: 'OE号不能为空', icon: 'none' });
      return;
    }

    this.setData({ isSaving: true });
    wx.showLoading({ title: '保存中...' });

    // 【核心逻辑】只更新有值的字段，防止误覆盖
    // 即使表单里某个字段为空，只要用户没改它，就不应该更新到数据库
    const updateData = {
      status: 'active', // 补全完成，状态改为正常
      update_time: db.serverDate(),
      images: this.data.formData.images,// 把图片数组一起保存
      oe_no: formData.oe_no,         
      location: formData.location      
    };

    // 逐个字段判断：只有当新值不为空字符串时，才加入更新队列
    if (formData.car_model !== undefined) updateData.car_model = formData.car_model || '';
    if (formData.model_year !== undefined) updateData.model_year = formData.model_year || '';
    if (formData.direction !== undefined) updateData.direction = formData.direction || '';
    if (formData.kyb_no !== undefined) updateData.kyb_no = formData.kyb_no || '';
    if (formData.brand !== undefined) updateData.brand = formData.brand || '';
    if (formData.remark !== undefined) updateData.remark = formData.remark || ''; 
    
    // 数字类型特殊处理：0 是有效值，不能简单用 if(formData.stock) 判断
    if (formData.stock !== '' && formData.stock !== null) {
      updateData.stock = Number(formData.stock) || 0;
    }
    if (formData.price !== '' && formData.price !== null) {
      updateData.price = Number(formData.price) || 0;
    }
    if (formData.warnStock !== '' && formData.warnStock !== null) {
      updateData.warnStock = Number(formData.warnStock) || 0;
    }
    console.log('最终写入数据库的数据:', JSON.stringify(updateData));
    // 执行数据库api更新
    db.collection('products').doc(id).update({
      data: updateData
    }).then(() => {
      wx.hideLoading();
      wx.showToast({ title: '补全成功', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack(); // 返回 pending 页面，列表会自动刷新
      }, 1500);
    }).catch(err => {
      wx.hideLoading();
      console.error(err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    }).finally(() => {
      this.setData({ isSaving: false });
    });
  }
});