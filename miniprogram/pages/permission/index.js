// pages/permission/index.js
// 管理权限：管理员给员工分配角色
const app = getApp();

// 角色映射（用于显示）
const ROLE_MAP = {
  'admin': '管理员',
  'warehouse_manager': '仓管',
  'sales': '业务员',
  'worker': '普通员工',
  'customer': '客户'
};

// 角色级别顺序：数组下标越小权限越高，分组时按此顺序排列
const ROLE_ORDER = ['admin', 'warehouse_manager', 'sales', 'worker', 'customer'];

// 按角色把员工列表归组：返回 [{ role, label, members }]，空组不保留，未知角色归入"其他"
function groupByRole(list) {
  const buckets = {};
  list.forEach(item => {
    const role = ROLE_ORDER.indexOf(item.role) !== -1 ? item.role : 'other';
    if (!buckets[role]) buckets[role] = [];
    buckets[role].push(item);
  });
  const groups = [];
  ROLE_ORDER.forEach(role => {
    if (buckets[role] && buckets[role].length > 0) {
      groups.push({ role, label: ROLE_MAP[role], members: buckets[role] });
    }
  });
  if (buckets.other && buckets.other.length > 0) {
    groups.push({ role: 'other', label: '其他/未知角色', members: buckets.other });
  }
  return groups;
}

Page({
  data: {
    employees: [],
    roleGroups: [],   // 按角色归类后的分组列表，供 WXML 渲染
    loading: false,
    roleOptions: [
      { name: 'admin', label: '管理员' },
      { name: 'warehouse_manager', label: '仓管' },
      { name: 'sales', label: '业务员' },
      { name: 'worker', label: '普通员工' },
      { name: 'customer', label: '客户' }
    ],
    pickerVisible: false,
    pickerRange: [],
    currentEmployee: null // 正在分配角色的员工
  },

  onShow() {
    if (!app.checkLogin()) return;
    // 权限校验：仅管理员可进入
    const globalRole = app.globalData && app.globalData.userInfo ? app.globalData.userInfo.role : null;
    const localRole = wx.getStorageSync('userRole');
    
    // 最终使用的角色
    const userRole = globalRole || localRole;

    console.log('【调试】当前缓存中的userRole:', userRole); 

    if (userRole !== 'admin') {
      wx.showToast({ 
        title: '仅管理员可访问',
        icon: 'none' });
      setTimeout(() => wx.navigateBack(), 800);
      return;
    }
    this.loadEmployees();
  },

  // 加载员工列表
  loadEmployees() {
    this.setData({ loading: true });
    wx.cloud.callFunction({
      name: 'managePermission',
      data: { action: 'listEmployees' },
      success: res => {
        this.setData({ loading: false });
        const r = res.result || {};
        if (r.success) {
          const list = (r.data || []).map(item => ({
            ...item,
            roleLabel: ROLE_MAP[item.role] || '未知'
          }));
          this.setData({
            employees: list,
            roleGroups: groupByRole(list)
          });
        } else {
          wx.showToast({ title: r.message || '加载失败', icon: 'none' });
          if (r.code === 403) {
            setTimeout(() => wx.navigateBack(), 800);
          }
        }
      },
      fail: () => {
        this.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  // 点击员工行，弹出角色选择
  onEditRole(e) {
    const id = e.currentTarget.dataset.id;
    const emp = this.data.employees.find(i => i._id === id);
    if (!emp) return;
    const range = this.data.roleOptions.map(o => o.label);
    this.setData({
      pickerVisible: true,
      pickerRange: range,
      currentEmployee: emp
    });
  },

  // 角色选择变化
  onPickerChange(e) {
    const idx = Number(e.detail.value);
    const role = this.data.roleOptions[idx].name;
    if (!role) return;
    this.confirmUpdateRole(this.data.currentEmployee, role);
  },

  // 关闭选择器
  closePicker() {
    this.setData({ pickerVisible: false, currentEmployee: null });
  },

  // 阻止冒泡
  noop() {},

  // 提交更新角色
  confirmUpdateRole(emp, newRole) {
    if (!emp) return;
    if (emp.role === newRole) {
      this.setData({ pickerVisible: false, currentEmployee: null });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    wx.cloud.callFunction({
      name: 'managePermission',
      data: { action: 'updateRole', employeeId: emp._id, newRole },
      success: res => {
        wx.hideLoading();
        const r = res.result || {};
        if (r.success) {
          wx.showToast({ title: '角色已更新', icon: 'success' });
          this.setData({ pickerVisible: false, currentEmployee: null });
          this.loadEmployees();
        } else {
          wx.showToast({ title: r.message || '更新失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  }
});