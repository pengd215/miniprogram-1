// components/remark-shortcuts/index.js
// 常用备注快捷输入栏：点按标签快速填入备注，支持添加/删除常用语（最多20条）
// 数据存储在本地缓存，入库页与出库页共用同一套常用语
const STORAGE_KEY = 'remark_shortcuts';
const MAX_COUNT = 20;

Component({
  properties: {
    // 主题色：入库页传绿色，出库页传红色
    accent: {
      type: String,
      value: '#07c160'
    }
  },

  data: {
    list: []
  },

  lifetimes: {
    attached() {
      this.loadList();
    }
  },

  methods: {
    // 从本地缓存读取常用语列表
    loadList() {
      let list = [];
      try {
        list = wx.getStorageSync(STORAGE_KEY) || [];
        if (!Array.isArray(list)) list = [];
      } catch (e) {
        console.error('[remark-shortcuts] 读取缓存失败', e);
      }
      this.setData({ list });
    },

    // 保存常用语列表到本地缓存并刷新视图
    saveList(list) {
      wx.setStorageSync(STORAGE_KEY, list);
      this.setData({ list });
    },

    // 点按标签：通知页面把内容填入备注框
    onTapTag(e) {
      const text = e.currentTarget.dataset.text;
      this.triggerEvent('fill', { value: text });
    },

    // 点按"＋ 添加"：弹窗输入新的常用语
    onAddTap() {
      if (this.data.list.length >= MAX_COUNT) {
        wx.showToast({ title: `最多${MAX_COUNT}条，请长按删除不常用的`, icon: 'none' });
        return;
      }
      wx.showModal({
        title: '添加常用备注',
        editable: true,
        placeholderText: '请输入常用备注内容',
        success: (res) => {
          if (!res.confirm) return;
          const text = (res.content || '').trim();
          if (!text) {
            wx.showToast({ title: '内容不能为空', icon: 'none' });
            return;
          }
          if (this.data.list.indexOf(text) !== -1) {
            wx.showToast({ title: '该内容已存在', icon: 'none' });
            return;
          }
          this.saveList([...this.data.list, text]);
          wx.showToast({ title: '添加成功', icon: 'success' });
        }
      });
    },

    // 长按标签：确认后删除该条常用语
    onLongPressTag(e) {
      const index = e.currentTarget.dataset.index;
      const text = this.data.list[index];
      wx.showModal({
        title: '删除常用备注',
        content: `确定删除"${text}"吗？`,
        confirmColor: '#ee5253',
        success: (res) => {
          if (!res.confirm) return;
          const list = [...this.data.list];
          list.splice(index, 1);
          this.saveList(list);
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      });
    }
  }
});
