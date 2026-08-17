const app = getApp();
//格式化时间的工具函数
const formatTime = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  
  // 补零函数
  const padZero = (num) => num < 10 ? '0' + num : num;

  const year = date.getFullYear();
  const month = padZero(date.getMonth() + 1);
  const day = padZero(date.getDate());
  const hour = padZero(date.getHours());
  const minute = padZero(date.getMinutes());
  const second = padZero(date.getSeconds());

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

Page({
  data: {
    FlowList: [],      // 注意这里是大写 F
    selectedDate: '',  // 选中的日期字符串 "2023-10-27"
    searchKey: '',     // 搜索框的内容
    page: 1,           // 当前页码
    isLoading: false,  // 是否正在加载
    hasMore: true,      // 是否还有更多数据
    currentTab: 'all',
    myOpenId: ''
  },

  onShow(){
    if (!app.checkLogin()) return;  // 未登录直接回登录页
  },

  onLoad() {
    // 直接用 app.js 缓存的 openid，避免无参调用云函数
    this.setData({ myOpenId: app.globalData.openid || '' });
    // 页面加载时自动查一次
    this.fetchLogs(); 
  },

  // 输入框变化时更新 searchKey
  onInputSearch(e) {
    this.setData({
      searchKey: e.detail.value
    });
  },

  // 日期选择回调
  onDateChange(e) {
    console.log('用户选择了日期:', e.detail.value);
    this.setData({
      selectedDate: e.detail.value
    });
  },
   // 切换 Tab 事件
  onTabChange(e) {
    const type = e.currentTarget.dataset.type; // 获取 wxml 传来的 type
    if (this.data.currentTab === type) return; // 如果点击当前tab则不操作
    console.log('切换 Tab 为:', type);
    this.setData({
      currentTab: type,
      page: 1,      // 切换分类必须重置页码
      FlowList: [],  // 清空当前列表
      hasMore: true
    });
    this.fetchLogs(); // 重新拉取数据
  },

  // 点击“查询”按钮
  onSearch() {
    // 点击查询时，重置页码为1，并重新加载
    this.setData({ page: 1, FlowList: [] });
    this.fetchLogs();
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({ page: 1, FlowList: [] });
    this.fetchLogs().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 触底加载更多
  onReachBottom() {
    if (!this.data.isLoading && this.data.hasMore) {
      this.setData({ page: this.data.page + 1 });
      this.fetchLogs(true); // true 表示是追加数据
    }
  },

  // 【核心】调用云函数获取数据
  fetchLogs(isLoadMore = false) {
    // 如果正在加载，防止重复请求
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });

    console.log('准备查询参数:', { 
      key: this.data.searchKey, 
      date: this.data.selectedDate 
    });

    return wx.cloud.callFunction({
      name: 'getFlowList', 
      data: {
        oe_no: this.data.searchKey,   
        dateStr: this.data.selectedDate, 
        type: this.data.currentTab === 'all' ? '' : this.data.currentTab,
        page: this.data.page,
        pageSize: 20
      }
    }).then(res => {
      if (!res.result || !res.result.success) {
        throw new Error(res.result ? res.result.msg : '云函数返回异常');
      }

      const newList = res.result.data || []; 

      // 【修复】定义处理函数（你之前写的 processItem）
      const processItem = (item) => {
        // 1. 处理时间
        const formattedTime = formatTime(item.create_time);

        // 2. 处理操作人显示
        // ✅ 正确写法：先从 employee_detail 数组里取出第一个员工对象
        const empInfo = item.employee_detail && item.employee_detail.length > 0 ? item.employee_detail[0] : null;

// 1. 获取名字：如果有员工信息，就取 name；否则显示 '未知人员'
// 注意：这里假设你员工表里的名字字段叫 'name'，如果是 'username' 请自行替换
        const realName = empInfo ? empInfo.name : '未知人员'; 

// 2. 判断是否是我自己
        const displayName = item._openid === this.data.myOpenId ? '我' : realName;
        
        // 3. 处理 OE 码拆分（这里是你原本写的复杂逻辑，我们保留它）
        let oeArr = [];
        if (Array.isArray(item.oe_no)) {
            oeArr = item.oe_no;
        } else if (typeof item.oe_no === 'string') {
            // 兼容逗号、空格分隔
            oeArr = item.oe_no.split(/[,，\s]+/).filter(Boolean); 
        }

        // 4. 处理备注截断
        let remarkPreview = item.remark || '';
        if (remarkPreview.length > 15) {
            remarkPreview = remarkPreview.substring(0, 15) + '...';
        }

        return {
          ...item, 
          formattedTime,
          displayName,
          oeDisplay: oeArr[0] || '无OE码', // 页面显示的第一个码
          oeCount: oeArr.length,           // 用于显示 +N
          oeList: oeArr,                   // 完整的数组，给 WXML 循环用
          remarkPreview 
        };
      };

      // 【关键】使用 map 调用上面的函数，生成最终列表
      const processedList = newList.map(item => processItem(item));

      // 【修复】只保留这一个 setData，且变量名必须与 data 中的 FlowList 一致
      this.setData({
        FlowList: isLoadMore ? [...this.data.FlowList, ...processedList] : processedList,
        isLoading: false,
        hasMore: newList.length === 20,
      });

    }).catch(err => {
      console.error("查流水失败", err);
      wx.showToast({ title: '网络开小差了', icon: 'none' });
      this.setData({ isLoading: false });
    });
  }
})
