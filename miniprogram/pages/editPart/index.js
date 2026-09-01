// pages/editPart/index.js
const db = wx.cloud.database();

// 图片拖拽排序的初始状态
const INITIAL_DRAG = {
  dragging: false, // 是否正在拖拽
  settling: false, // 拖拽结束的过渡帧（关闭动画，防止位置跳变闪烁）
  dragKey: -1,     // 被拖动图片的原始下标
  order: [],       // 当前 槽位 -> 原始下标 的映射
  slots: [],       // 每个槽位相对网格的自然位置
  transforms: [],  // 拖拽期间每张图片的 transform 位移
  gridLeft: 0,     // 网格相对视口的位置
  gridTop: 0,
  offsetX: 0,      // 手指相对图片左上角的偏移
  offsetY: 0,
  itemW: 0,        // 图片宽（px）
  itemH: 0         // 图片高（px）
};

Page({
  data: {
    id: '', // 数据库记录的唯一ID
    formData: {
      oe_no: '',
      oeList: [], // OE 码数组（增删交互用，保存时合并回字符串）
      car_model: '',
      model_year: '',
      direction: '',
      location: '',
      kyb_no: '',
      stock: 0,
      price: 0,
      remark:'',
      // isReadOnlyStock: false,
      images: [], // 初始化图片数组
      brand: '',
      warnStock: ''
    },
    isSaving: false,
    drag: { ...INITIAL_DRAG } // 图片拖拽排序状态
  },

  // 点击已上传图片时预览大图（拖拽刚结束 300ms 内忽略，防止误触发）
  previewImage(e) {
    if (Date.now() - (this._dragEndedAt || 0) < 300) return;
    const src = e.currentTarget.dataset.src;
    wx.previewImage({ current: src, urls: this.data.formData.images });
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
      const rawOe = data.oe_no;
      const oeList = Array.isArray(rawOe)
        ? rawOe.map(v => String(v).trim()).filter(Boolean)
        : (rawOe ? String(rawOe).split(/[,，\s]+/).filter(Boolean) : []);
      this.setData({
        formData: {
          oe_no: data.oe_no || '',
          oeList: oeList,
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
  // 1. 选择图片（一次可多选，自动填入图片区，最多 3 张）
  chooseImage() {
    const remaining = 3 - this.data.formData.images.length; // 剩余可传数量
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传3张图片', icon: 'none' });
      return;
    }
    wx.chooseMedia({
      count: remaining,
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

  // —— 图片拖拽排序 ——

  // 长按图片开始拖拽：读取各图片当前位置，进入拖拽状态
  onImgLongPress(e) {
    if (this.data.drag.dragging) return;
    const index = e.currentTarget.dataset.index; // 被长按图片所在槽位
    const images = this.data.formData.images;
    if (images.length < 2) return; // 少于 2 张无需排序

    wx.createSelectorQuery().in(this)
      .select('.image-grid').boundingClientRect()
      .selectAll('.img-item').boundingClientRect()
      .exec((res) => {
        const grid = res[0];
        const rects = res[1];
        if (!grid || !rects || rects.length !== images.length) return;

        // 每个槽位相对网格左上角的位置（即各图片的初始布局位置）
        const slots = rects.map(r => ({ x: r.left - grid.left, y: r.top - grid.top }));
        const n = images.length;
        const order = [];
        const transforms = [];
        for (let i = 0; i < n; i++) {
          order.push(i); // 初始：槽位 i 放第 i 张图
          transforms.push({ x: 0, y: 0 });
        }

        // 手指相对被拖图片左上角的偏移，保证拖动时图片跟手
        const rect = rects[index];
        this.setData({
          drag: {
            dragging: true,
            settling: false,
            dragKey: index,
            order,
            slots,
            transforms,
            gridLeft: grid.left,
            gridTop: grid.top,
            offsetX: e.touches[0].clientX - rect.left,
            offsetY: e.touches[0].clientY - rect.top,
            itemW: rect.width,
            itemH: rect.height
          }
        });
        wx.vibrateShort({ type: 'light' }); // 轻震动反馈，提示已进入拖动状态
      });
  },

  // 拖拽移动：被拖图片跟手移动，其余图片实时让位
  onImgTouchMove(e) {
    const drag = this.data.drag;
    if (!drag.dragging) return;

    const touch = e.touches[0];
    const { slots, order, dragKey, offsetX, offsetY, gridLeft, gridTop, itemW, itemH } = drag;
    const n = order.length;

    // 被拖图片左上角在网格内的坐标（跟手）
    const x = touch.clientX - gridLeft - offsetX;
    const y = touch.clientY - gridTop - offsetY;

    // 用被拖图片的中心点找最近的槽位，作为目标位置
    const cx = x + itemW / 2;
    const cy = y + itemH / 2;
    let target = 0;
    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      const sx = slots[i].x + itemW / 2;
      const sy = slots[i].y + itemH / 2;
      const d = (cx - sx) * (cx - sx) + (cy - sy) * (cy - sy);
      if (d < minDist) { minDist = d; target = i; }
    }

    // 目标槽位变化时调整 order：被拖图片插到目标槽位，其余顺移
    const newOrder = [...order];
    const from = newOrder.indexOf(dragKey);
    if (from !== -1 && from !== target) {
      newOrder.splice(from, 1);
      newOrder.splice(target, 0, dragKey);
    }

    // 重算每张图片的位移：被拖图跟手，其余图移向各自目标槽位
    const transforms = [];
    for (let key = 0; key < n; key++) {
      if (key === dragKey) {
        transforms.push({ x: x - slots[key].x, y: y - slots[key].y });
      } else {
        const slotIdx = newOrder.indexOf(key);
        transforms.push({ x: slots[slotIdx].x - slots[key].x, y: slots[slotIdx].y - slots[key].y });
      }
    }

    this.setData({
      'drag.order': newOrder,
      'drag.transforms': transforms
    });
  },

  // 拖拽结束：把新顺序写回图片数组，并关闭动画防止回跳闪烁
  onImgTouchEnd() {
    const drag = this.data.drag;
    if (!drag.dragging) return;

    const images = this.data.formData.images;
    const newImages = drag.order.map(key => images[key]);

    this.setData({
      'formData.images': newImages,
      'drag.dragging': false,
      'drag.settling': true,
      'drag.transforms': []
    });
    this._dragEndedAt = Date.now(); // 抑制紧跟着的 tap，避免误预览

    // 过渡帧结束后恢复初始状态
    setTimeout(() => {
      this.setData({ drag: { ...INITIAL_DRAG } });
    }, 350);
  },

  // —— OE 码数组操作 ——

  // 添加一行空的 OE 码
  addOe() {
    const list = [...this.data.formData.oeList, ''];
    this.setData({ 'formData.oeList': list });
  },

  // 修改某一行的 OE 码内容
  onOeInput(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const list = [...this.data.formData.oeList];
    list[index] = value;
    this.setData({ 'formData.oeList': list });
  },

  // 删除某一行的 OE 码（右上角删除按钮）
  removeOe(e) {
    const index = e.currentTarget.dataset.index;
    const list = [...this.data.formData.oeList];
    list.splice(index, 1);
    this.setData({ 'formData.oeList': list });
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
    const oeListTrimmed = (formData.oeList || []).map(v => String(v).trim()).filter(Boolean);
    const oeNoStr = [...new Set(oeListTrimmed)].join(' ');
    if (!oeNoStr) {
      wx.showToast({ title: 'OE号不能为空', icon: 'none' });
      return;
    }

    this.setData({ isSaving: true });
    wx.showLoading({ title: '保存中...' });

    // 【核心逻辑】只更新有值的字段，防止误覆盖
    const updateData = {
      status: 'active', // 补全完成，状态改为正常
      update_time: db.serverDate(),
      images: this.data.formData.images,// 把图片数组一起保存
      oe_no: oeNoStr,
      location: formData.location
    };

    // 逐个字段判断：只有当新值不为空字符串时，才加入更新队列
    if (formData.car_model !== '' && formData.car_model !== null && formData.car_model !== undefined) updateData.car_model = formData.car_model || '';
    if (formData.model_year !== '' && formData.model_year !== null && formData.model_year !== undefined) updateData.model_year = formData.model_year || '';
    if (formData.direction !== '' && formData.direction !== null && formData.direction !== undefined) updateData.direction = formData.direction || '';
    if (formData.kyb_no !== '' && formData.kyb_no !== null && formData.kyb_no !== undefined) updateData.kyb_no = formData.kyb_no || '';
    if (formData.brand !== '' && formData.brand !== null && formData.brand !== undefined) updateData.brand = formData.brand || '';
    if (formData.remark !== '' && formData.remark !== null && formData.remark !== undefined) updateData.remark = formData.remark || ''; 

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

    db.collection('products').doc(id).update({ data: updateData })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => {
          wx.navigateBack(); // 返回上一页，列表会自动刷新
        }, 1500);
      })
      .catch(err => {
        wx.hideLoading();
        console.error(err);
        wx.showToast({ title: '保存失败: ' + err.message, icon: 'none' });
      })
      .finally(() => {
        this.setData({ isSaving: false });
      });
  }
})
