// pages/product/list.js
const db = wx.cloud.database(); 
Page({
  data: {
    keyword: '', // 搜索框输入的关键词
    productList: [] // 存放从数据库查出来的列表数据
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
    this.fetchData(keyword);
  },

  // 核心函数：从数据库获取数据
  fetchData: function(keyword) {
    wx.showLoading({ title: '加载中...' });

    let query = db.collection('products');

    // 如果有关键词，就添加模糊搜索条件
    if (keyword && keyword.trim() !== '') {
      // 使用正则表达式进行模糊匹配 (kyb_no 或 car_model 包含关键词)
      // 这里的逻辑是：只要 kyb_no 包含关键词，或者 car_model 包含关键词，都搜出来
      query = query.where(
        db.command.or([
          {
            kyb_no: db.RegExp({ regexp: keyword,options:'i',  })//  i  表示忽略大小写
          },
          {car_model: db.RegExp({ regexp: keyword,options: 'i',})
          }
        ])
      );
    }
    // 2. 【关键修改】在这里添加排序逻辑
  // stockCount: 你的库存字段名（请确保与数据库一致）
  // 'asc': 升序（从小到大，即库存少的在最上面）
    query = query.orderBy('stock', 'asc').limit(20); 
     // 3. 执行查询
    query.get().then(res => {
      wx.hideLoading();

      // 处理数据，适配你页面的显示需求
      // 注意：数据库里叫 quantity，你之前的代码可能习惯叫 stock，这里做个映射
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

      this.setData({
        productList: list
      });
      wx.hideLoading();
    }).catch(err => {
      console.error('查询失败:', err);
      wx.hideLoading();
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  }
})