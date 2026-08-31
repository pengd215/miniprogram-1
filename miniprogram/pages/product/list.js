// pages/product/list.js
const app = getApp();
const db = wx.cloud.database();
Page({
  data: {
    keyword: '', // 搜索框输入的关键词
    productList: [], // 存放当前页展示的列表数据
    page: 1,          // 下一页要加载的页码
    pageSize: 20,     // 每页条数
    hasMore: true,     // 是否还有更多数据
    isLoading: false, // 加载锁，防止重复请求
    statusFilter: '',  // 库存状态筛选：''全部 | out缺货 | low紧张 | normal充足
    showDetail: false,    // 是否展示产品详情弹窗（仅展示，无出入库操作）
    detailInfo: null,     // 弹窗展示的产品完整信息
    detailLoading: false  // 详情加载锁，防止重复点击
  },
  onShow() {
    if (!app.checkLogin()) return;  // 未登录直接回登录页
    if (!this._loaded) {
      this._loaded = true;
      this.loadPage(1, false);
    }
  },

  onLoad: function () {
    // 数据加载在 onShow 里做，保证登录态检查先行
  },

  // 监听搜索框输入
  onInputChange: function (e) {
    this.setData({
      keyword: e.detail.value
    });
  },

  // 点击搜索按钮
  onSearch: function () {
    this.loadPage(1, false);
  },

  // 点击库存状态筛选（全部/缺货/紧张/充足）
  onFilterChange: function (e) {
    const status = e.currentTarget.dataset.status;
    if (status === this.data.statusFilter) return;
    this.setData({ statusFilter: status });
    this.loadPage(1, false);
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadPage(this.data.page, true); // 加载下一页
    }
  },

  // 点击列表项：按 _id 查询完整产品信息并以弹窗展示（仅展示，无出入库操作）
  onShowDetail: function (e) {
    const item = e.currentTarget.dataset.item || {};
    if (!item._id || this.data.detailLoading) return;
    this.setData({ detailLoading: true });
    wx.showLoading({ title: '加载中...', mask: true });
    db.collection('products').doc(item._id).get().then(res => {
      wx.hideLoading();
      const d = res.data || {};
      // OE号统一解析为数组：兼容数组存储与逗号/空格分隔的字符串存储
      const rawOe = d.oe_no;
      const oeList = Array.isArray(rawOe)
        ? rawOe.map(v => String(v).trim()).filter(Boolean)
        : (rawOe ? String(rawOe).split(/[,，\s]+/).filter(Boolean) : []);
      const rawStock = d.stock === undefined || d.stock === null ? 0 : Number(d.stock);
      const s = app.getStockStatus(rawStock, d);
      const statusMap = { pending: '待完善', active: '正常' };
      this.setData({
        detailLoading: false,
        showDetail: true,
        detailInfo: {
          oeList: oeList,
          kyb_no: d.kyb_no || '-',
          car_model: d.car_model || '-',
          model_year: d.model_year || '-',
          direction: d.direction || '-',
          location: d.location || '-',
          stockCount: rawStock,
          warnStock: (d.warnStock === undefined || d.warnStock === null || d.warnStock === '') ? '-' : Number(d.warnStock),
          price: (d.price === undefined || d.price === null) ? '-' : Number(d.price),
          statusText: statusMap[d.status] || d.status || '-',
          stockStatusClass: s.color,
          stockStatusText: s.text,
          createTime: this.formatDetailTime(d.create_time),
          remark: d.remark || '暂无备注',
          images: Array.isArray(d.images) ? d.images : []
        }
      });
    }).catch(err => {
      console.error('加载产品详情失败:', err);
      wx.hideLoading();
      this.setData({ detailLoading: false });
      wx.showToast({ title: '加载详情失败', icon: 'none' });
    });
  },

  // 关闭详情弹窗
  onCloseDetail: function () {
    this.setData({ showDetail: false, detailInfo: null });
  },

  // 阻止弹窗内容区的点击冒泡，避免点内容区时误关弹窗
  noop: function () {},

  // 预览产品图片
  onPreviewImage: function (e) {
    const url = e.currentTarget.dataset.url;
    const urls = (this.data.detailInfo && this.data.detailInfo.images) || [];
    if (!url || urls.length === 0) return;
    wx.previewImage({ current: url, urls: urls });
  },

  // 把云数据库时间格式化为可读文本
  formatDetailTime: function (t) {
    if (!t) return '-';
    const d = new Date(t);
    if (isNaN(d.getTime())) return '-';
    const pad = n => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  },

  onPullDownRefresh: function () {
    this.loadPage(1, false); // 下拉刷新时重置分页
    wx.stopPullDownRefresh();
  },

  // 优先调用云函数取一页数据：状态计算、筛选、排序、分页全部在服务器完成
  loadPage: function (page, isLoadMore) {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });
    if (!isLoadMore) {
      this.setData({ productList: [], hasMore: true });
    }
    wx.showLoading({ title: isLoadMore ? '加载中...' : '搜索中...', mask: true });

    wx.cloud.callFunction({
      name: 'listProducts',
      data: {
        keyword: this.data.keyword,
        status: this.data.statusFilter,
        page: page,
        pageSize: this.data.pageSize
      }
    }).then(res => {
      wx.hideLoading();
      const r = res.result || {};
      if (!r.success) {
        this.setData({ isLoading: false });
        wx.showToast({ title: r.message || '加载失败', icon: 'none' });
        return;
      }
      const list = r.list || [];
      this.setData({
        productList: isLoadMore ? [...this.data.productList, ...list] : list,
        page: page + 1,
        hasMore: !!r.hasMore,
        isLoading: false
      });
    }).catch(err => {
      // 云函数未部署或网络异常时，退回本地查询，保证基础功能可用
      console.warn('listProducts 云函数不可用，切换本地查询：', err);
      this.localQuery(page, isLoadMore);
    });
  },

  // 本地兜底查询（仅"全部/缺货"支持；紧张/充足依赖服务器精确计算）
  localQuery: function (page, isLoadMore) {
    const statusFilter = this.data.statusFilter;
    if (statusFilter === 'low' || statusFilter === 'normal') {
      wx.hideLoading();
      this.setData({ isLoading: false, hasMore: false });
      wx.showToast({ title: '该筛选需先部署 listProducts 云函数', icon: 'none', duration: 2500 });
      return;
    }
    app.loadWarningConfig().then(() => {
      const conditions = [];
      const k = (this.data.keyword || '').trim();
      if (k) {
        conditions.push(db.command.or([
          { kyb_no: db.RegExp({ regexp: k, options: 'i' }) },
          { car_model: db.RegExp({ regexp: k, options: 'i' }) }
        ]));
      }
      if (statusFilter === 'out') {
        conditions.push({ stock: db.command.lte(0) });
      }
      let query = db.collection('products');
      if (conditions.length > 0) {
        query = query.where(conditions.length === 1 ? conditions[0] : db.command.and(conditions));
      }
      query.orderBy('stock', 'asc')
        .skip((page - 1) * this.data.pageSize)
        .limit(this.data.pageSize)
        .get()
        .then(res => {
          wx.hideLoading();
          const list = res.data.map(item => {
            let raw = item.stock;
            if (raw === undefined || raw === null) raw = 0;
            const count = Number(raw);
            const s = app.getStockStatus(count, item);
            return {
              _id: item._id,
              kyb_no: item.kyb_no,
              car_model: item.car_model,
              stockCount: count,
              images: item.images,
              statusClass: s.color,
              statusText: s.text
            };
          });
          this.setData({
            productList: isLoadMore ? [...this.data.productList, ...list] : list,
            page: page + 1,
            hasMore: list.length === this.data.pageSize,
            isLoading: false
          });
        })
        .catch(err => {
          console.error('查询失败:', err);
          wx.hideLoading();
          this.setData({ isLoading: false });
          wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
        });
    });
  }
})
