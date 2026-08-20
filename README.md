# 逐鹿减振器库存管理系统 · 微信小程序
> 一个基于微信云开发的减振器配件库存管理小程序，从配件建档到出入库、流水追溯、库存预警、库位管理、客户报价，覆盖汽配门店库存全流程。
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-WeChat%20MiniProgram-green)
![Backend](https://img.shields.io/badge/backend-CloudBase%20(Serverless)-ff69b4)
![Version](https://img.shields.io/badge/version-1.0.0-orange)

面向企业内部员工提供配件建档、出入库、流水追踪、库存预警、仓库库位管理等功能，同时为下游客户提供独立的报价查询入口。**已上线运行**，代码即实际生产可用版本。

- 前端：微信小程序原生框架（WXML / WXSS / JS）
- 后端：微信云开发（云函数 + 云数据库 + 文件存储），无需自建服务器
- 数据一致性：库存扣减与流水记录使用数据库事务，保证原子性

> 📷 **功能截图**：仓库程序为纯代码仓库，建议部署后在微信开发者工具内自行截图补充到 `docs/screenshots/`，并在下方占位处替换为截图链接。

## 功能特性

- **账号登录与角色权限**：员工账号密码登录（SHA-256 加盐哈希存储，存量明文账号自动迁移），登录后自动绑定微信 OpenID，一个账号绑定一个微信；按角色控制功能与数据范围
- **配件快速查询**：工作台支持按 OE 编码 / KYB 编码 / 车型 / 商品 ID 模糊搜索，支持扫码枪扫描查询
- **一键建档**：查询不到配件时提示立即建档，新档案初始状态为"待完善"，可在待办列表统一处理
- **扫码管理**：为每个配件生成二维码（Base64，可保存到相册），扫码可定位库位、绑定商品
- **库存出入库**：入库/出库操作采用数据库事务，确保"库存变动 + 流水记录"同时成功或同时失败；出库自动校验库存是否充足
- **流水日志追踪**：按 OE 编码 / 日期 / 出入库类型筛选，聚合联表展示操作人姓名；管理员可查看全部流水，其他角色只能查看本人经手记录
- **库存预警**：支持全局预警阈值（可在设置中调整）与单品自定义预警值，库存状态自动标记为"缺货 / 紧张 / 充足"
- **仓库库位管理**：库区增删、库位批量生成（行列号自动编码，单次最多 500 个）、扫码绑定 / 解绑商品
- **员工权限管理**：管理员可为员工分配角色，内置"至少保留一名管理员"保护，防止系统锁死
- **客户报价查询**：客户角色登录后进入独立的报价查询页，仅返回报价相关字段，避免内部信息（库存、成本）泄露

## 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    微信小程序前端（miniprogram/）               │
│   登录 / 工作台 / 产品列表 / 出入库 / 流水 / 仓库 / 权限 / 报价    │
└───────────────┬─────────────────────────────────────────────┘
                │ wx.cloud.callFunction / db
┌───────────────▼─────────────────────────────────────────────┐
│                 微信云开发（CloudBase）                        │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────────────┐  │
│  │ 云函数×11  │  │ 云数据库×6 │  │ 权限校验（服务端 OpenID+角色）│  │
│  │ Node.js    │  │ NoSQL     │  │ 事务 / 防注入 / 字段投影    │  │
│  └───────────┘  └───────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 页面结构

| 页面 | 路径 | 说明 |
| --- | --- | --- |
| 登录 | `pages/login/login` | 员工 / 客户账号密码登录，按角色分流跳转 |
| 工作台 | `pages/index/index` | 配件搜索、扫码、二维码生成、待办提醒、快捷出入库入口 |
| 产品列表 | `pages/product/list` | 配件分页列表，支持搜索、下拉刷新、滚动加载 |
| 流水日志 | `pages/logs/logs` | 出入库流水查询，按条件筛选 |
| 个人中心 | `pages/employee/profile` | 个人资料展示 |
| 新建配件 | `pages/createPart/index` | 配件建档（支持图片上传） |
| 编辑配件 | `pages/editPart/index` | 档案编辑、状态完善、单品预警值设置 |
| 待办列表 | `pages/pending/index` | 待完善配件档案清单 |
| 入库 / 出库 | `pages/inbound/inbound`、`pages/outbound/outbound` | 数量录入、备注、提交 |
| 库存预警 | `pages/stock/warning` | 全局预警阈值配置（管理员 / 仓库管理员） |
| 库区管理 | `pages/warehouse/warehouseArea/index` | 库区增删 |
| 库位管理 | `pages/warehouse/locationMgr/index` | 库位批量生成、扫码绑定商品 |
| 员工权限 | `pages/permission/index` | 员工列表与角色分配（仅管理员） |
| 客户报价 | `pages/client/search` | 客户报价查询入口 |
| 账号设置 | `pages/account_setting/setting` | 账号信息设置 |
| 帮助反馈 | `pages/help_feedback/feedback` | 功能反馈提交 |

## 云函数

| 云函数 | 功能 |
| --- | --- |
| `userLogin` | 账号密码登录校验、OpenID 绑定、密码哈希迁移 |
| `checkPart` | 配件多字段模糊查询（OE / KYB / 车型 / ID） |
| `getProductById` | 按 ID 查询配件详情 |
| `submitInbound` | 入库事务：库存增加 + 流水记录 |
| `submitOutbound` | 出库事务：库存校验扣减 + 流水记录 |
| `getFlowList` | 流水日志查询（条件筛选、分页、联表取操作人姓名、按角色控制数据范围） |
| `updateWarningConfig` | 全局库存预警阈值读取 / 保存（角色鉴权） |
| `warehouseManage` | 库区 / 库位管理：增删、批量生成、扫码绑定 / 解绑商品 |
| `managePermission` | 员工列表查询、角色分配（仅管理员，含管理员保护） |
| `clientSearchQuote` | 客户报价查询（字段投影，只返回报价所需信息） |
| `generateQRCode` | 基于 `qrcode` 库生成配件二维码（Base64） |

## 数据库集合

| 集合 | 用途 |
| --- | --- |
| `products` | 配件档案（OE / KYB 编码、车型、库存、价格、库位、预警值、图片等） |
| `employees` | 员工账号（用户名、密码哈希、姓名、角色、绑定的 OpenID） |
| `transaction_logs` | 出入库流水（类型、数量、操作人、时间、备注） |
| `warehouses` | 库区定义 |
| `locations` | 库位定义及商品绑定关系 |
| `settings` | 全局配置（如库存预警阈值） |

## 角色权限

| 角色 | 说明 |
| --- | --- |
| `admin` | 管理员：全部数据可见，可管理权限、仓库配置、预警配置 |
| `warehouse_manager` | 仓库管理员：可管理仓库配置与预警配置 |
| `sales` | 业务 |
| `worker` | 普通员工 |
| `customer` | 客户：登录后进入报价查询，不进入管理后台 |

## 快速开始

### 环境准备

- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（稳定版即可）
- 一个已注册的小程序 AppID（个人 / 企业均可，云开发需为企业或个人主体开通）

### 部署步骤

1. **导入项目**：打开微信开发者工具，导入本目录，替换 `project.config.json` 中的 `appid` 为你自己的小程序 AppID
2. **开通云开发**：点击"云开发"开通环境，在 `miniprogram/app.js` 中将 `env` 改为你的云环境 ID
3. **部署云函数**：在开发者工具中对 `cloudfunctions/` 下的每个云函数目录右键选择"上传并部署（云端安装依赖）"；或参考 `uploadCloudFunction.sh` 的命令行部署方式（该脚本为示例占位，需按实际环境 ID 与项目路径修改后使用）
4. **创建数据库集合**：手动创建 `products`、`employees`、`transaction_logs`、`warehouses`、`locations`、`settings` 六个集合
5. **初始化数据**：在 `employees` 集合中手动添加一名员工（`role` 设为 `admin`），初始密码可为明文，首次登录成功后会由云函数自动迁移为哈希存储
6. **初始化预警配置（可选）**：在 `settings` 集合中添加 `_id` 为 `warning` 的文档，包含 `lowStock`（默认低库存阈值）与 `maxStock`（默认积压阈值），缺省时使用代码内置的 10 / 100

> 未登录时会自动跳转登录页；首次使用前请确保云函数已全部部署完成。

## 目录结构

```
miniprogram-1/
├── miniprogram/          # 小程序前端源码
│   ├── pages/            # 页面（登录、工作台、出入库、产品、仓库、权限等）
│   ├── components/       # 自定义组件
│   ├── images/           # 图片与图标资源
│   └── app.js            # 全局逻辑（云初始化、登录检查、库存状态计算）
├── cloudfunctions/       # 云函数（每个目录一个独立云函数）
├── docs/                 # 项目文档（含代码检查与修复变更清单）
├── uploadCloudFunction.sh# 云函数批量上传脚本
└── project.config.json   # 小程序项目配置（本地，不入库）
```

## 安全设计

- 密码使用 SHA-256 加盐哈希存储，数据库中不保存明文；存量明文账号首次登录自动迁移
- 所有云函数在服务端校验操作人 OpenID 与角色，前端不直接依赖端侧权限
- 出入库使用数据库事务，避免并发场景下库存与流水不一致
- 查询关键字经过正则转义处理，防止正则注入（ReDoS）
- 客户报价查询使用字段投影，仅返回报价所需字段
- 管理员角色内置"至少保留一名管理员"保护，防止系统锁死

## 常见问题（FAQ）

**Q1：登录报"账号或密码错误"？**
先确认 `employees` 集合中已添加了员工账号（`role: "admin"`），且云函数 `userLogin` 已部署最新版本。

**Q2：云函数调用报 `FunctionName not found`？**
云函数未部署或部署失败。请在开发者工具中对 `cloudfunctions/` 下每个目录右键 →"上传并部署（云端安装依赖）"。

**Q3：修改了 `project.config.json` 但 Git 里没有变化？**
`project.config.json`（含 AppID）与 `project.private.config.json` 属于本地个人配置，已加入 `.gitignore`，不会提交到仓库。开源仓库中请自行保留本地副本。

**Q4：如何补充功能截图？**
在开发者工具中运行项目后截图，放入 `docs/screenshots/`，并将 README 顶部的占位链接替换为实际图片。

## 贡献指南

欢迎提 Issue 反馈问题或建议，也接受 Pull Request。提交前请：

1. 遵循现有代码风格（不使用 ESLint 强制约束，保持与现有代码一致）
2. 云函数改动需通过 `node --check` 语法校验（或 `npm test`）
3. 在 PR 描述中说明改动内容与测试情况

## License
[MIT](./LICENSE) © [pengd215](https://github.com/pengd215)