// pages/permission/index.js
// 管理权限：管理员管理员工档案（搜索 / 新增 / 修改角色 / 启用停用 / 删除）
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
    employees: [],      // 全量员工列表
    roleGroups: [],     // 筛选 + 按角色归类后的分组列表，供 WXML 渲染
    filteredCount: 0,   // 筛选后的员工数量
    loading: false,

    // 搜索与筛选
    keyword: '',        // 搜索关键词：匹配姓名 / 账号
    roleFilterIndex: 0, // 角色下拉筛选的选中下标
    roleFilterOptions: ['全部角色', '管理员', '仓管', '业务员', '普通员工', '客户'],
    roleFilterValues: ['all', 'admin', 'warehouse_manager', 'sales', 'worker', 'customer'],

    // 修改角色弹窗
    roleOptions: [
      { name: 'admin', label: '管理员' },
      { name: 'warehouse_manager', label: '仓管' },
      { name: 'sales', label: '业务员' },
      { name: 'worker', label: '普通员工' },
      { name: 'customer', label: '客户' }
    ],
    roleLabels: ['管理员', '仓管', '业务员', '普通员工', '客户'],
    pickerVisible: false,
    pickerRange: [],
    currentEmployee: null, // 正在分配角色的员工

    // 新增员工弹窗
    createVisible: false,
    createForm: { name: '', username: '', password: '', roleIndex: 3 }, // 默认普通员工
    submitting: false
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
            roleLabel: ROLE_MAP[item.role] || '未知',
            // 兼容存量数据：无 status 字段视为在职/启用
            status: item.status === 'disabled' ? 'disabled' : 'active'
          }));
          this.setData({ employees: list }, () => this.applyFilter());
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

  // 应用"关键词 + 角色"筛选，重新生成分组列表
  applyFilter() {
    const kw = (this.data.keyword || '').trim().toLowerCase();
    const role = this.data.roleFilterValues[this.data.roleFilterIndex] || 'all';
    const list = this.data.employees.filter(item => {
      const matchKw = !kw ||
        (item.name || '').toLowerCase().indexOf(kw) !== -1 ||
        (item.username || '').toLowerCase().indexOf(kw) !== -1;
      const matchRole = role === 'all' || item.role === role;
      return matchKw && matchRole;
    });
    this.setData({
      roleGroups: groupByRole(list),
      filteredCount: list.length
    });
  },

  // 搜索框输入（检索姓名 / 账号）
  onSearchInput(e) {
    this.setData({ keyword: e.detail.value }, () => this.applyFilter());
  },

  // 清空搜索关键词
  clearSearch() {
    this.setData({ keyword: '' }, () => this.applyFilter());
  },

  // 角色下拉筛选变化
  onRoleFilterChange(e) {
    this.setData({ roleFilterIndex: Number(e.detail.value) }, () => this.applyFilter());
  },

  // ================= 新增员工 =================

  openCreateDialog() {
    this.setData({
      createVisible: true,
      createForm: { name: '', username: '', password: '', roleIndex: 3 }
    });
  },

  closeCreateDialog() {
    if (this.data.submitting) return;
    this.setData({ createVisible: false });
  },

  onCreateInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`createForm.${field}`]: e.detail.value });
  },

  onCreateRoleChange(e) {
    this.setData({ 'createForm.roleIndex': Number(e.detail.value) });
  },

  // 提交创建员工
  submitCreate() {
    if (this.data.submitting) return;
    const { name, username, password, roleIndex } = this.data.createForm;
    const trimName = (name || '').trim();
    const trimUsername = (username || '').trim();

    if (!trimName) {
      wx.showToast({ title: '请输入姓名', icon: 'none' });
      return;
    }
    if (!trimUsername) {
      wx.showToast({ title: '请输入账号', icon: 'none' });
      return;
    }
    if (!/^[A-Za-z0-9_]{3,20}$/.test(trimUsername)) {
      wx.showToast({ title: '账号需为3-20位字母、数字或下划线', icon: 'none' });
      return;
    }
    if (!password || password.length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' });
      return;
    }

    const role = this.data.roleOptions[roleIndex].name;
    this.setData({ submitting: true });
    wx.showLoading({ title: '创建中...' });
    wx.cloud.callFunction({
      name: 'managePermission',
      data: {
        action: 'createEmployee',
        name: trimName,
        username: trimUsername,
        password,
        role
      },
      success: res => {
        wx.hideLoading();
        const r = res.result || {};
        if (r.success) {
          wx.showToast({ title: '员工已创建', icon: 'success' });
          this.setData({ createVisible: false, submitting: false });
          this.loadEmployees();
        } else {
          this.setData({ submitting: false });
          wx.showToast({ title: r.message || '创建失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  },

  // ================= 修改角色 =================

  // 点击员工行/修改角色按钮，弹出角色选择
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
  },

  // ================= 启用 / 停用 =================

  // 状态开关切换：checked=绿色在职启用，unchecked=灰色离职停用
  onToggleStatus(e) {
    const id = e.currentTarget.dataset.id;
    const enabled = e.detail.value;
    const newStatus = enabled ? 'active' : 'disabled';
    const emp = this.data.employees.find(i => i._id === id);
    if (!emp) return;

    wx.showLoading({ title: '处理中...' });
    wx.cloud.callFunction({
      name: 'managePermission',
      data: { action: 'updateStatus', employeeId: id, newStatus },
      success: res => {
        wx.hideLoading();
        const r = res.result || {};
        if (r.success) {
          wx.showToast({ title: enabled ? '已启用' : '已停用', icon: 'success' });
        } else {
          wx.showToast({ title: r.message || '操作失败', icon: 'none' });
        }
        // 无论成败都重新拉取，确保开关状态与服务端一致
        this.loadEmployees();
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络异常', icon: 'none' });
        this.loadEmployees();
      }
    });
  },

  // ================= 删除（敏感操作，二次确认） =================

  onDeleteEmployee(e) {
    const id = e.currentTarget.dataset.id;
    const emp = this.data.employees.find(i => i._id === id);
    if (!emp) return;
    wx.showModal({
      title: '删除员工',
      content: `确定删除员工「${emp.name || emp.username}」吗？删除后该账号无法登录，且不可恢复。`,
      confirmText: '删除',
      confirmColor: '#d32f2f',
      success: r => {
        if (r.confirm) this.doDelete(id);
      }
    });
  },

  doDelete(id) {
    wx.showLoading({ title: '删除中...' });
    wx.cloud.callFunction({
      name: 'managePermission',
      data: { action: 'deleteEmployee', employeeId: id },
      success: res => {
        wx.hideLoading();
        const r = res.result || {};
        if (r.success) {
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadEmployees();
        } else {
          wx.showToast({ title: r.message || '删除失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  }
});
