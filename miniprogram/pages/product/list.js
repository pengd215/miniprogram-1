// pages/product/list.js
const db = wx.cloud.database(); 
Page({
  data: {
    keyword: '', // 搜索框输入的关键词
    productList: [], // 存放从数据库查出来的列表数据
    page: 1,          // 当前页码
    pageSize: 20,     // 新增：每页条数
    hasMore: true,     // 新增：是否还有更多数据
    isLoading: false // 增加加载锁，防止重复请求
  },

  onLoad: function () {
    // 页面加载时，先获取一次所有数据
    this.fetchData('');
  },

  // 监听搜索框输入
  onInputChange: function(e) {
    this.setData({
      keyword: e.detail.value
    });
  },

  // 点击搜索按钮
  onSearch: function() {
    const keyword = this.data.keyword;
    this.fetchData(keyword,false);
  },

  onReachBottom: function() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.fetchData(this.data.keyword, true); // 传入 true 表示加载更多
    }
  },

  onPullDownRefresh: function() {
    this.fetchData(this.data.keyword, false); // 下拉刷新时重置分页
    wx.stopPullDownRefresh();
  },

  // 核心函数：从数据库获取数据
  fetchData: function(keyword, isLoadMore = false) {
    if (!isLoadMore) {
      this.setData({ 
        page: 1, 
        productList: [], 
        hasMore: true,
        isLoading: false 
      });
    }
  
    // 如果正在加载或没有更多数据，直接返回
    if (this.data.isLoading || !this.data.hasMore) return;
    // 🔒 加锁
    this.setData({ isLoading: true });
    wx.showLoading({ title: isLoadMore ? '加载中...' : '搜索中...' });

    let query = db.collection('products');

    // 如果有关键词，就添加模糊搜索条件
    if (keyword && keyword.trim() !== '') {
      query = query.where(
        db.command.or([
          {kyb_no: db.RegExp({ regexp:keyword,options:'i',  })},
          {car_model: db.RegExp({ regexp: keyword,options: 'i',})}
        ])
      );
    }
    //排序逻辑
  // 'asc': 升序（从小到大，即库存少的在最上面）
  const skipCount = (this.data.page - 1)* this.data.pageSize;
    query.orderBy('stock', 'asc')
    .skip(skipCount)
    .limit(this.data.pageSize)
    .get()
    .then(res => {
      // 处理数据，适配你页面的显示需求
      const list = res.data.map(item => {

        console.log('当前条目数据:', item);
        let rawStock = item.stock;
        if (rawStock === undefined || rawStock === null) {
          console.warn('警告：数据库里这条数据没有 stock 字段！', item._id);
          rawStock = 0; // 给个默认值
      }
    
      const count = Number(rawStock);
      // 根据数量动态生成样式类名
      let statusClass = 'status-normal'; // 默认绿色/正常
      let statusText = '有货';           // 默认文字

      if (count <= 0) {
        statusClass = 'status-out';      // 缺货红色
        statusText = '缺货';
      } else if (count < 10) {
        statusClass = 'status-low';      // 库存紧张黄色
        statusText = '紧张';
      }


        return {
          _id: item._id,
          kyb_no: item.kyb_no,
          car_model: item.car_model,
          stockCount: count,
          images: item.images,
          statusClass: statusClass,
          statusText: statusText
        };
      });

       // 追加数据而非覆盖
      const newList = isLoadMore
      ? [...this.data.productList, ...list]
      : list;

      this.setData({
        productList: newList,
        page: this.data.page + 1,
        hasMore: list.length === this.data.pageSize,  // 返回条数等于pageSize说明还有下一页
        isLoading: false
      });
      wx.hideLoading();
    }).catch(err => {
      console.error('查询失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  }
})