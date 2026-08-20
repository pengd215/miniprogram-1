// pages/index/index.js
const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    oeCode: '',           // 搜索框输入内容
    productData: null,    // 查询到的完整商品对象
    loading: false,       // 加载状态
    searchResults: [],    // 多条搜索结果
    resultCount: 0,       // 结果数量
    pendingCount: 0,       // 待办数量
    stock:'',
    showQrcode: false,
    productId:'',
    qrCodeBase64: '',
    showList: true
  },

  onLoad(options) {
    console.log('onLoad 收到的所有参数：', options)
    this.setData({ productId: options._id })
  },


    // 显示二维码
  showQRCode() {

    if (!this.data.productData) {
      wx.showToast({ title: '请先查询商品信息', icon: 'none' })
      return
    }
    this.setData({ showQrcode: true })
    this.generateQRCode()
  },

  // 调用云函数生成二维码
  async generateQRCode() {
    wx.showLoading({ title: '生成二维码...' })
    try {
      const res = await wx.cloud.callFunction({
        name: 'generateQRCode',
        data: {
          text: this.data.productData._id,
          size: 200
        }
      })
      //打印控制台
      console.log('云函数返回的完整结果:', res)
      console.log('云函数返回的 base64:', res.result.base64)

      wx.hideLoading()


      if (res.result && res.result.success) {
        this.setData({
          qrCodeBase64: 'data:image/png;base64,' + res.result.base64
        })
      } else {
        wx.showToast({ title: '二维码生成失败', icon: 'none' })
      }
    } catch (err) {
      wx.hideLoading()
      console.error('生成二维码失败:', err)
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  },

  // 保存到相册
  saveQRCode() {
    const base64 = this.data.qrCodeBase64
    if (!base64) {
      wx.showToast({ title: '请先生成二维码', icon: 'none' })
      return
    }
    const fs = wx.getFileSystemManager()
    const filePath = wx.env.USER_DATA_PATH + '/qrcode.png'
    const base64Data = base64.split(',')[1]

    fs.writeFile({
      filePath: filePath,
      data: base64Data,
      encoding: 'base64',
      success: () => {
        wx.saveImageToPhotosAlbum({
          filePath: filePath,
          success: () => {
            wx.showToast({ title: '已保存到相册', icon: 'success' })
          }
        })
      },
      fail: (err) => {
        console.error('保存失败:', err)
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    })
  },

  hideQRCode() {
    this.setData({ showQrcode: false })
  },

  onShow() {
    // 检查登录状态
    if (!app.checkLogin()) {
      wx.reLaunch({
        url: '/pages/login/login'
      });
      return;
    }
    // 首次进入时加载全局预警阈值，确保库存状态判断取数据库最新值
    if (!this._warnLoaded) {
      this._warnLoaded = true;
      app.loadWarningConfig();
    }
    // 每次进入首页，刷新待办数量
    this.fetchPendingCount();
    // 如果当前输入框有值，返回时自动重新查询
    if (this.data.oeCode && this.data.oeCode.trim() !== '') {
      setTimeout(() => {
        this.handleSearch();
      }, 300);
    }
  },

  // 获取待办数量
  fetchPendingCount() {
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

  // 跳转到编辑页
  goToEdit(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) {
      wx.showToast({ title: '数据ID缺失', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/editPart/index?id=${id}`
    });
  },

  // 从搜索结果列表中选中一条
  handleSelectResult(e) {
    const id = e.currentTarget.dataset.id;
    const list = this.data.searchResults;
    const item = list.find(i => i._id === id);
    if (!item) return;

    const rawOeStr = item.oe_no || '';
    const oeArray = rawOeStr ? rawOeStr.trim().split(/\s+/) : [];
    const stock = Number(item.stock) || 0;
    const stockStatus = app.getStockStatus(stock, item);
    const formattedProduct = {
      _id: item._id,
      kyb_no: item.kyb_no || '无',
      oe_no: rawOeStr || '无',
      oe_list: oeArray,
      car_model: item.car_model || '暂无车型',
      model_year: item.model_year || 0,
      direction: item.direction || '',
      stock: stock || 0,
      stockStatusText: stockStatus.text,
      stockStatusClass: stockStatus.color,
      location: item.location || '-',
      price: item.price || 0,
      images: item.images || [],
      remark: item.remark || ''
    };
    this.setData({
      productId:id,
      productData: formattedProduct,
      showList: false
    });
    // 【新增】点选后滚动到详情卡片
      wx.pageScrollTo({ selector: '#detailCard', duration: 300 });
  },
  backToList() {
    this.setData({
      productData: null,
      showList: true
    });
  },

  // 删除配件档案
  handleDelete(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) {
      wx.showToast({ title: '数据ID缺失', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '确认删除',
      content: '确定要删除该物品吗？\n注意：该物品的所有入库、出库流水记录也将被永久删除！',
      confirmColor: '#e64340',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '正在清理数据...' });
          try {
            // 1. 查询关联的流水记录
            const logsRes = await db.collection('transaction_logs')
              .where({ product_id: id })
              .get();

            // 2. 如果存在关联流水，则批量删除
            if (logsRes.data.length > 0) {
              const logIds = logsRes.data.map(item => item._id);
              // 云数据库 remove 单次最多操作 100 条，超量时分批删除
              const BATCH_SIZE = 100;
              for (let s = 0; s < logIds.length; s += BATCH_SIZE) {
                const batch = logIds.slice(s, s + BATCH_SIZE);
                await db.collection('transaction_logs')
                  .where({ _id: db.command.in(batch) })
                  .remove();
              }
              console.log(`已清理 ${logIds.length} 条流水记录`);
            }

            // 3. 删除商品本身
            await db.collection('products').doc(id).remove();

            wx.hideLoading();
            wx.showToast({ title: '已彻底删除', icon: 'success' });

            // 清除当前页面的查询结果
            this.setData({
              productData: null,
              oeCode: '',
              searchResults: [],
              resultCount: 0
            });

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
    console.log('>>> clearInput 被调用了');
    this.setData({
      oeCode: '',
      productData: null,
      searchResults: [],
      resultCount: 0
    });
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

    this.setData({
      loading: true,
      productData: null,
      searchResults: [],
      resultCount: 0
    });

    // 调用云函数 checkPart
    wx.cloud.callFunction({
      name: 'checkPart',
      data: { keyword: keyword },
      success: res => {
        this.setData({ loading: false });

        if (res.result && res.result.code === 200) {
          let rawData = res.result.data;
          // 兼容处理：确保是数组
          let list = Array.isArray(rawData) ? rawData : (rawData ? [rawData] : []);

          if (list.length === 0) {
            // 未找到数据，提示是否建档
            this.showAddDialog(keyword);
            return;
          }

          if (list.length === 1) {
            // 只有一条，直接展示详情
            const item = list[0];
            const rawOeStr = item.oe_no || '';
            const stockStatus = app.getStockStatus(item.stock || 0, item);
            const oeArray = rawOeStr ? rawOeStr.trim().split(/\s+/) : [];
            const formattedProduct = {
              _id: item._id,
              kyb_no: item.kyb_no || '无',
              oe_no: rawOeStr || '无',
              oe_list: oeArray,
              car_model: item.car_model || '暂无车型',
              model_year: item.model_year || 0,
              direction: item.direction || '',
              stock: item.stock || 0,
              location: item.location || '-',
              price: item.price || 0,
              images: item.images || [],
              remark: item.remark || '',
              stockStatusText: stockStatus.text,
              stockStatusClass: stockStatus.color
            };
            this.setData({
              productData: formattedProduct,
              searchResults: [],
              showList: false
            });
            wx.pageScrollTo({ selector: '#detailCard', duration: 300 });
          } else {
            // 多条结果，展示列表让用户选择
            const resultList = list.map(item => { const stockStatus = app.getStockStatus(item.stock || 0, item);
              const rawOeStr = item.oe_no || '';
              const oeArray = rawOeStr ? rawOeStr.trim().split(/\s+/) : [];
            return {  
              _id: item._id,
              kyb_no: item.kyb_no || '无',
              oe_no: item.oe_no || '无',
              oe_list: oeArray,
              car_model: item.car_model || '暂无车型',
              model_year: item.model_year || 0,
              direction: item.direction || '',
              stock: item.stock || 0,
              location: item.location || '-',
              price: item.price || 0,
              images: item.images || [],   // 【新增】带图片，保证点选后详情能显示
              stockStatusListClass: stockStatus.listClass
              };
            });

            this.setData({
              productData: null,
              searchResults: resultList,
              resultCount: resultList.length,
              showList: true
            });
            wx.pageScrollTo({ selector: '#resultList', duration: 300 });
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
          wx.navigateTo({
            url: `/pages/createPart/index?oe_no=${oe_no}`
          });
        }
      }
    });
  },

  // 图片放大预览功能
  previewImage(e) {
    const currentUrl = e.currentTarget.dataset.src;
    const images = (this.data.productData && this.data.productData.images) || [];

    if (!images || images.length === 0) {
      return;
    }

    wx.previewImage({
      current: currentUrl,
      urls: images
    });
  },

  // 跳转到入库页
  goToInbound(e) {
    const item = this.data.productData;
    if (!item) {
      wx.showToast({ title: '请先查询数据', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/inbound/inbound?id=${item._id}`
    });
  },

  // 跳转到出库页
  goToOutbound(e) {
    const item = e.currentTarget.dataset.item || this.data.productData;
    if (!item) {
      wx.showToast({ title: '请先查询数据', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/outbound/outbound?id=${item._id}`
    });
  }
});
