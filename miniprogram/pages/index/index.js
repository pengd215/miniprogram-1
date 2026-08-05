// pages/index/index.js
const db = wx.cloud.database();

Page({
  data: {
    oeCode: '',           // 搜索框输入内容
    productData: null,    // 查询到的完整商品对象
    loading: false,        // 加载状态
    pendingCount: 0        // 待办数量
  },

  onShow() {
    // 每次进入首页，刷新待办数量
    this.fetchPendingCount();
    // 2. 关键修复：如果当前输入框有值（说明是查询后进去的），返回时自动重新查询
    if (this.data.oeCode && this.data.oeCode.trim() !== '') {
      setTimeout(() => {
        this.handleSearch(); 
      }, 300); // 延迟300毫秒，避免和页面渲染冲突
    }
  },

  // 获取待办数量
  fetchPendingCount() {
    const db = wx.cloud.database();
    db.collection('products')
      .where({ status: 'pending' })
      .count()
      .then(res => {
        this.setData({ pendingCount: res.total });
      })
      .catch(err => {
        console.error('获取待办数量失败', err);
      });
  },

  // 跳转到待办列表页
  goToPending() {
    wx.navigateTo({
      url: '/pages/pending/index'
    });
  },

  goToEdit(e) {
    const id = e.currentTarget.dataset.id;
    
    if (!id) {
      wx.showToast({ title: '数据ID缺失', icon: 'none' });
      return;
    }
    // 跳转到待办补全页面，带上 ID
    wx.navigateTo({
      url: `/pages/editPart/index?id=${id}`
    });
  },

  /**
   * 删除配件档案
   */
  handleDelete(e) {
    const id = e.currentTarget.dataset.id;

    if (!id) {
      wx.showToast({ title: '数据ID缺失', icon: 'none' });
      return;
    }

    // 二次确认弹窗
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该物品吗？\n注意：该物品的所有入库、出库流水记录也将被永久删除！',
      confirmColor: '#e64340',
      success: async(res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在清理数据...' });
          try {
            const logsRes = await db.collection('transaction_logs')
            .where({ product_id: id }) 
            .get();
          
          // 如果存在关联流水，则批量删除
          if (logsRes.data.length > 0) {
            const logIds = logsRes.data.map(item => item._id);
            
            // 使用 _.in 进行批量删除 引入 db.command
            await db.collection('transaction_logs')
              .where({ _id: db.command.in(logIds) })
              .remove();
              
            console.log(`已清理 ${logIds.length} 条流水记录`);
          }
            // 3. 最后删除【商品】本身
            await db.collection('products').doc(id).remove();

            wx.hideLoading();
            wx.showToast({ title: '已彻底删除', icon: 'success' });
   
   // 清除当前页面的查询结果
              this.setData({ productData: null, oeCode: '' });

            } catch (err) { 
            wx.hideLoading();
            console.error("删除失败", err);
            wx.showToast({ title: '删除失败，请重试', icon: 'none' });
            }
          }
        }
      });
    },


  // 监听输入框
  onInput(e) {
    this.setData({ oeCode: e.detail.value });
  },

  // 清空输入框
  clearInput() {
    this.setData({ oeCode: '', productData: null });
  },

  // 扫码功能
  handleScan() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        this.setData({ oeCode: res.result });
        this.handleSearch(); // 扫码后自动查询
      },
      fail: (err) => {
        console.log('扫码取消或失败', err);
      }
    });
  },
  // 核心查询功能
  handleSearch() {
    const keyword = this.data.oeCode.trim();
    
    if (!keyword) {
      wx.showToast({ title: '请输入或扫描编码', icon: 'none' });
      return;
    }

    this.setData({ loading: true, productData: null });

    // 调用云函数 checkPart 
    wx.cloud.callFunction({
      name: 'checkPart',
      data: { keyword: keyword },
      success: res => {
        this.setData({ loading: false });
        
        if (res.result && res.result.code === 200) {
          let rawData = res.result.data;
          
          // 兼容处理：如果是数组取第一个，如果是对象直接用
          let item = Array.isArray(rawData) ? rawData[0] : rawData;
          
          if (item) {
            const rawOeStr = item.oe_no || '';
            const oeArray = rawOeStr ? rawOeStr.trim().split(/\s+/) : [];
            // 构建标准化的前端数据对象
            const formattedProduct = {
              _id: item._id,
              kyb_no: item.kyb_no || '无',
              oe_no: rawOeStr||'无', 
      // 【新增】存入拆分后的数组（专门给 WXML 循环渲染用）
              oe_list: oeArray,
              car_model: item.car_model || '暂无车型',
              model_year:item.model_year|| 0, 
              direction: item.direction || '',
              stock: item.stock || 0,
              location: item.location || '-',
              price: item.price || 0,
              images: item.images || [],
              remark: item.remark || ''
            };

            this.setData({ productData: formattedProduct });
          } else {
            // 未找到数据，提示是否建档
            this.showAddDialog(keyword);
          }
        } else {
          // 云函数返回未找到
          this.showAddDialog(keyword);
        }
      },
      fail: err => {
        console.error('查询失败', err);
        this.setData({ loading: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 提示建档弹窗
  showAddDialog(oe_no) {
    wx.showModal({
      title: '未找到配件',
      content: `未找到编码为 "${oe_no}" 的配件，是否立即建档？`,
      confirmText: '去建档',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          // 跳转到建档页面，并把关键词带过去
          wx.navigateTo({
            url: `/pages/createPart/index?oe_no=${oe_no}`
          });
        }
      }
    });
  },

  /*图片放大预览功能*/
  previewImage: function (e) {
    // 1. 获取当前点击的图片地址
    // 注意：确保 wxml 中 data-src 绑定的是当前图片的地址
    const currentUrl = e.currentTarget.dataset.src;
    
    // 2. 获取该商品的所有图片列表
    // 从 data 中取出 productData，兼容处理防止报错
    const images = (this.data.productData && this.data.productData.images) || [];

    // 3. 如果没有图片，直接返回
    if (!images || images.length === 0) {
      return;
    }

    // 4. 调用微信原生预览接口
    wx.previewImage({
      current: currentUrl, // 当前显示图片的链接
      urls: images         // 需要预览的图片链接列表（支持多图左右滑动）
    });
  },

  // 跳转到入库页 (传递完整对象)
  goToInbound(e) {
    // 获取当前查询到的完整数据对象
    const item = this.data.productData; 
    
    if (!item) {
      wx.showToast({ title: '请先查询数据', icon: 'none' });
      return;
    }
  
    wx.navigateTo({
      url: `/pages/inbound/inbound?id=${item._id}` // 将对象转为字符串传递
    });
  },

  // 跳转到出库页 (传递完整对象)
  goToOutbound(e) {
    const item = e.currentTarget.dataset.item;
    
    if (!item) {
      wx.showToast({ title: '请先查询数据', icon: 'none' });
      return;
    }
    
    wx.navigateTo({
      url: `/pages/outbound/outbound?id=${item._id}`
    });
  }
});