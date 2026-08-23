const app = getApp();
// 导出类型映射：与导出弹窗类型选择器的下标一一对应
const EXPORT_TYPES = ['all', 'inbound', 'outbound'];

// CSV 单元格转义：含逗号/引号/换行时用双引号包裹，内部引号翻倍
const escapeCsv = (val) => {
  let s = String(val == null ? '' : val);
  if (/[",\r\n]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
};
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
    myOpenId: '',
    myRole: '',        // 【新增】当前用户角色（用于控制撤销按钮显示）
    // --- 批量导出相关 ---
    showExportModal: false,   // 是否显示导出弹窗
    exportStartDate: '',      // 导出开始日期
    exportEndDate: '',        // 导出结束日期
    exportTypeIndex: 0,       // 导出类型下标：0全部 1入库 2出库
    isExporting: false,       // 是否正在导出中
    exportTypeOptions: ['全部', '入库', '出库'] // 导出类型选项（与 EXPORT_TYPES 一一对应）
  },

  onShow(){
    if (!app.checkLogin()) return;  // 未登录直接回登录页
  },

  onLoad() {
    // 直接用 app.js 缓存的 openid，避免无参调用云函数
    this.setData({ myOpenId: app.globalData.openid || '' });
    
    // 【新增】获取当前角色信息，用于控制撤销按钮权限
    this.loadMyRole();
    
    // 页面加载时自动查一次
    this.fetchLogs(); 
  },

  // 【新增】加载当前用户角色
  loadMyRole() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo && userInfo.role) {
      this.setData({ myRole: userInfo.role });
    }
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

  // 点击"查询"按钮
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

      // 定义处理函数
      const processItem = (item) => {
        // 1. 处理时间
        const formattedTime = formatTime(item.create_time);

        // 2. 处理操作人显示
        const empInfo = item.employee_detail && item.employee_detail.length > 0 ? item.employee_detail[0] : null;

// 1. 获取名字：如果有员工信息，就取 name；否则显示 '未知人员'
        const realName = empInfo ? empInfo.name : '未知人员'; 

// 2. 判断是否是我自己
        const displayName = item._openid === this.data.myOpenId ? '我' : realName;
        
        // 3. 处理 OE 码拆分
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

        // 5. 【新增】判断是否可回退
        const canUndo = !!item.snapshot_id && item.type !== 'undo' && item.type !== 'system';
        // 管理员/主管才显示撤销按钮
        const showUndoBtn = canUndo && ['admin', 'warehouse_manager'].includes(this.data.myRole);

        return {
          ...item, 
          formattedTime,
          displayName,
          oeDisplay: oeArr[0] || '无OE码', // 页面显示的第一个码
          oeCount: oeArr.length,           // 用于显示 +N
          oeList: oeArr,                   // 完整的数组，给 WXML 循环用
          remarkPreview,
          canUndo,
          showUndoBtn
        };
      };

      // 【关键】使用 map 调用上面的函数，生成最终列表
      const processedList = newList.map(item => processItem(item));

      // 只保留这一个 setData，且变量名必须与 data 中的 FlowList 一致
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
  },

  // ==================== 批量导出 ====================

  // 打开导出弹窗：默认按当前 Tab 预选导出类型，默认导出当天
  onOpenExport() {
    const today = formatTime(new Date()).slice(0, 10);
    const tabIndex = Math.max(EXPORT_TYPES.indexOf(this.data.currentTab), 0);
    this.setData({
      showExportModal: true,
      exportStartDate: today,
      exportEndDate: today,
      exportTypeIndex: tabIndex
    });
  },

  // 关闭导出弹窗
  onCloseExport() {
    if (this.data.isExporting) return; // 导出进行中禁止关闭
    this.setData({ showExportModal: false });
  },

  // 阻止弹窗内容区的点击冒泡到遮罩
  noop() {},

  // 导出弹窗：开始日期变化
  onExportStartChange(e) {
    this.setData({ exportStartDate: e.detail.value });
  },

  // 导出弹窗：结束日期变化
  onExportEndChange(e) {
    this.setData({ exportEndDate: e.detail.value });
  },

  // 导出弹窗：类型选择变化
  onExportTypeChange(e) {
    this.setData({ exportTypeIndex: Number(e.detail.value) });
  },

  // 确认导出：调云函数取数 -> 生成 CSV 文件 -> 提供打开/分享/保存
  confirmExport() {
    const { exportStartDate, exportEndDate, exportTypeIndex, isExporting } = this.data;
    if (isExporting) return;

    if (!exportStartDate) {
      return wx.showToast({ title: '请选择开始日期', icon: 'none' });
    }
    if (exportEndDate && exportEndDate < exportStartDate) {
      return wx.showToast({ title: '结束日期不能早于开始日期', icon: 'none' });
    }

    this.setData({ isExporting: true });
    wx.showLoading({ title: '导出中...', mask: true });

    wx.cloud.callFunction({
      name: 'exportFlowData',
      data: {
        startDate: exportStartDate,
        endDate: exportEndDate || exportStartDate,
        type: EXPORT_TYPES[exportTypeIndex]
      }
    }).then(res => {
      wx.hideLoading();
      if (!res.result || !res.result.success) {
        throw new Error(res.result ? res.result.msg : '云函数返回异常');
      }
      const rows = res.result.data || [];
      if (rows.length === 0) {
        this.setData({ isExporting: false, showExportModal: false });
        return wx.showToast({ title: '该时间段暂无数据', icon: 'none' });
      }

      const csv = this.buildCsv(rows);
      const fileName = this.buildFileName();

      // 写入用户文件目录（BOM 头确保 Excel 打开不乱码）
      const fs = wx.getFileSystemManager();
      const dirPath = `${wx.env.USER_DATA_PATH}/flow_export`;
      const filePath = `${dirPath}/${fileName}`;
      try { fs.mkdirSync(dirPath, true); } catch (e) { /* 目录已存在 */ }
      fs.writeFileSync(filePath, '\ufeff' + csv, 'utf8');

      this.setData({ isExporting: false, showExportModal: false });
      wx.showToast({ title: `已导出 ${rows.length} 条`, icon: 'success' });
      this.offerCsvActions(filePath, fileName, res.result.exported, res.result.total);
    }).catch(err => {
      wx.hideLoading();
      console.error('导出失败', err);
      this.setData({ isExporting: false });
      wx.showToast({ title: '导出失败，请重试', icon: 'none' });
    });
  },

  // 拼接 CSV 内容：OE编码,车型,时间,操作人,数量,参考价格，方向，库位
  buildCsv(rows) {
    const header = ['时间','操作人','OE编码', '车型', '方向', '库存位置', '数量', '参考价格'];
    const lines = [header.join(',')];
    rows.forEach(r => {
      // oe_no 兼容数组格式（多码用分号连接）
      let oe = '';
      if (Array.isArray(r.oe_no)) {
        oe = r.oe_no.filter(Boolean).join(';');
      } else {
        oe = r.oe_no || r.oe_key || '';
      }
      lines.push([
        escapeCsv(r.formatted_time || ''),
        escapeCsv(r.operator_name || ''),
        escapeCsv(oe),
        escapeCsv(r.car_model || ''),
        escapeCsv(r.direction || ''),
        escapeCsv(r.location || ''),
        escapeCsv(r.quantity == null ? '' : r.quantity),
        escapeCsv(r.price == null ? '' : r.price)
      ].join(','));
    });
    return lines.join('\r\n');
  },

  // 生成文件名，如：流水导出_入库_20260801-20260818.csv
  buildFileName() {
    const { exportStartDate, exportEndDate, exportTypeIndex } = this.data;
    const typeLabel = this.data.exportTypeOptions[exportTypeIndex] || '全部';
    const s = (exportStartDate || '').replace(/-/g, '');
    const e = (exportEndDate || exportStartDate || '').replace(/-/g, '');
    return `流水导出_${typeLabel}_${s}${e !== s ? '-' + e : ''}.csv`;
  },

  // 导出成功后的处理：CSV 无法被小程序直接打开（openDocument 不支持该格式），
  // 唯一可行路径是通过微信把文件发到聊天（如"文件传输助手"），然后在聊天里点开文件，用 Excel 或 WPS 打开
  offerCsvActions(filePath, fileName, exported, total) {
    // 达到导出上限时提醒用户缩小时间范围
    if (exported >= 2000 && total > exported) {
      wx.showModal({
        title: '提示',
        content: `该时间段共有 ${total} 条记录，本次仅导出前 ${exported} 条。如需全部数据，请缩小时间范围分批导出。`,
        showCancel: false
      });
      return;
    }

    wx.showModal({
      title: '导出成功',
      content: `已导出 ${exported} 条记录。CSV 文件需要发送到微信聊天（建议选"文件传输助手"），然后在聊天里点开文件，用 Excel 或 WPS 打开。`,
      confirmText: '发送文件',
      cancelText: '稍后处理',
      success: (r) => {
        if (!r.confirm) return;
        wx.shareFileMessage({
          filePath,
          fileName,
          success: () => wx.showToast({ title: '已发起发送', icon: 'success' }),
          fail: (err) => {
            console.error('发送文件失败', err);
            wx.showToast({ title: '发送取消或失败', icon: 'none' });
          }
        });
      }
    });
  },

  // ==================== 操作回退功能 ====================

  /**
   * 点击某条流水的"撤销"按钮
   * @param {Object} e - 事件对象，包含 dataset 中的 id/type/oe/qty
   */
  onUndoTap(e) {
    const { id, type, oe, qty } = e.currentTarget.dataset;
    
    // 不支持回退的类型直接返回
    const unsupportedTypes = ['undo', 'system'];
    if (unsupportedTypes.includes(type)) {
      return wx.showToast({ title: '该操作不支持回退', icon: 'none' });
    }

    const typeName = this.getTypeName(type);
    
    wx.showModal({
      title: '确认回退此操作？',
      content: `即将回退: ${typeName} | ${oe || '-'} | 数量: ${qty || 0}\n\n⚠️ 回退后数据将恢复到操作前的状态`,
      confirmText: '确认回退',
      confirmColor: '#e74c3c',
      success: (res) => {
        if (res.confirm) {
          this.showUndoReasonInput(id, typeName);
        }
      }
    });
  },

  /**
   * 弹出回退原因输入框（使用微信原生可编辑弹窗）
   */
  showUndoReasonInput(snapshotId, opTypeName) {
    wx.showModal({
      title: `请填写"${opTypeName}"的回退原因`,
      editable: true,
      placeholderText: '例如：数量填错 / 误操作 / 测试数据等',
      success: (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          this.executeUndo(snapshotId, res.content.trim());
        } else if (res.confirm) {
          wx.showToast({ title: '请输入回退原因', icon: 'none' });
        }
      }
    });
  },

  /**
   * 执行回退操作 —— 调用 undoOperation 云函数
   */
  executeUndo(snapshotId, reason) {
    wx.showLoading({ title: '正在回退...', mask: true });

    wx.cloud.callFunction({
      name: 'undoOperation',
      data: {
        snapshotId: snapshotId,
        remark: reason
      },
      success: (res) => {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showToast({ 
            title: `✓ ${res.result.message}`, 
            icon: 'success',
            duration: 2000 
          });
          // 延迟刷新列表以更新状态
          setTimeout(() => {
            this.setData({ page: 1, FlowList: [] });
            this.fetchLogs();
          }, 1500);
        } else {
          // 业务逻辑错误
          const errMsg = res.result.message || '回退失败';
          wx.showToast({ 
            title: errMsg, 
            icon: 'none',
            duration: 3000 
          });
          
          // 特殊错误码提示
          if (res.result.code === 409) {
            console.warn('[undo] 该操作已被回过');
          } else if (res.result.code === 403) {
            console.warn('[undo] 权限不足');
          }
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('回退请求失败:', err);
        wx.showToast({ title: '网络异常，请重试', icon: 'none' });
      }
    });
  },

  /**
   * 辅助：获取操作类型的中文名
   */
  getTypeName(type) {
    const map = {
      'inbound': '入库',
      'outbound': '出库',
      'product_update': '编辑产品',
      'product_create': '新建产品',
      'undo': '回退操作'
    };
    return map[type] || type;
  },
})
