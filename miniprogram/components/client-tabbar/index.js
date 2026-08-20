// components/client-tabbar/index.js
// 客户端专用底部导航：首页 / 改装配件 / 关于我们 / 个人
// 灰黑米配色；图标用内联 SVG 绘制，无需新增图片素材

// 根据路径内容与颜色生成 SVG data URI
const svgIcon = (inner, color) => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
};

// 四个页签的图标路径内容
const ICON_PATHS = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  parts: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  about: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  profile: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'
};

// 页签配置：key 与页面传入的 active 属性对应，url 为跳转目标页
const TABS = [
  { key: 'home', label: '首页', url: '/pages/client/search' },
  { key: 'parts', label: '改装配件', url: '/pages/parts/parts' },
  { key: 'about', label: '关于我们', url: '/pages/about/about' },
  { key: 'profile', label: '个人', url: '/pages/profile/profile' }
];

const GRAY = '#9A9A9A';  // 未选中：中灰
const BLACK = '#1F1F1F'; // 选中：主黑

Component({
  properties: {
    // 当前激活的页签 key：home | parts | about | profile
    active: { type: String, value: 'home' }
  },

  data: {
    tabs: []
  },

  lifetimes: {
    attached() {
      // 为每个页签生成普通态与选中态图标
      const tabs = TABS.map(t => ({
        key: t.key,
        label: t.label,
        icon: svgIcon(ICON_PATHS[t.key], GRAY),
        iconActive: svgIcon(ICON_PATHS[t.key], BLACK)
      }));
      this.setData({ tabs });
    }
  },

  methods: {
    onTabTap(e) {
      const key = e.currentTarget.dataset.key;
      if (key === this.properties.active) return; // 已在当前页，不重复跳转
      const tab = TABS.find(t => t.key === key);
      if (!tab) return;
      wx.redirectTo({ url: tab.url });
    }
  }
});
