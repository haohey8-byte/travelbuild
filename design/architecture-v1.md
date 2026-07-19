# 入境游定制协作工作台 · 架构设计 v1（闸门 2 · 待审批）

> 本文档是「带闸门开发」流程的第二个人工确认点（Architecture Design）。
> 上游：阶段 2 澄清闸门（4 项技术决策已确认）。下游：阶段 4 MVP 前端 / 阶段 5 后端 / 阶段 6 权限 / 阶段 7 微信协作 / 阶段 8 测试部署。
> 配套需求文档：`PRD_入境游定制协作工作台_v0.9.12.md`（协作模型已双向化 + 案例展示拉回 MVP + 新增技术栈章节）。

---

## 0. 已确认技术决策（来自澄清闸门）

| 维度 | 决策 | 备注 |
|---|---|---|
| 前端框架 | **Vue 3 + Vite** | H5 组件库待定（候选：Vant / NutUI，按微信 H5 体验选型） |
| 后端 | **Node.js（TypeScript）** | 框架候选 Express（轻）或 NestJS（结构化）；推荐 NestJS 以支撑权限/模块边界 |
| 数据库 | **PostgreSQL + JSONB** | 关系数据用表，行程/报价结构化内容用 JSONB 列，兼顾灵活与强一致 |
| 鉴权 | **微信网页授权（OAuth2）+ 邀请制** | 与 PRD 一致：管理者邀请 → 微信授权 → 直接获得权限 |
| 多语言 | **i18n（EN/ZH/TH/RU）** | 与 PRD Q6.1–Q6.3 一致 |
| 利润模式 | **模式 A + B 并存** | 数据层强制分离成本价①/利润②（见 PRD 4.2.18） |

### 与 PRD 既有假设的偏差（需回写 PRD）
1. **MVP 范围上调**：用户决策 MVP「全部含案例展示」。原 PRD 写「案例展示延后 Phase 2」。**已回写 PRD v0.9.11**——案例展示拉回 MVP 一期，并补充脱敏合规发布流到 4.8.6 节。
2. **部署形态**：用户选 Node+PG（非 CloudBase 内置）。→ 部署改用「腾讯云 CloudBase 云托管（Docker 容器跑 Node）+ 静态资源 CDN/EdgeOne」，不再依赖 CloudBase 文档数据库。

---

## 1. 系统架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                          微信（H5 协作主通道）                       │
│   旅行社/省地接社在微信内打开 H5 链接 → 查看行程+报价 / 填草案 / 反馈   │
└───────────────┬───────────────────────────────┬──────────────────┘
                │ 微信网页授权(OAuth2)             │ 公开 H5（免登录，带 token）
                ▼                                 ▼
┌──────────────────────────┐         ┌──────────────────────────────┐
│   Vue 3 SPA（一手/管理后台） │         │   公开 H5 视图（行程+报价展示）  │
│   Vite build → CDN/EdgeOne  │         │   只读 + 反馈表单               │
└───────────────┬────────────┘         └───────────────┬──────────────┘
                │ REST/JSON                        │ REST/JSON（token 鉴权）
                ▼                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Node.js API（NestJS）— Docker 容器                │
│  ├─ Auth 模块（微信授权 + JWT + 邀请制）                              │
│  ├─ Routes 模块（路线/客户 CRUD + 状态机）                            │
│  ├─ Draft 模块（旅行社发起行程规划草案）★新增                        │
│  ├─ ItineraryQuote 模块（行程报价单 + 5 级价 + 版本号）              │
│  ├─ Feedback 模块（修改反馈，关联 day/quote_item）                   │
│  ├─ Permission 中间件（三方角色字段级可见性）★                       │
│  ├─ Knowledge 模块（知识库）                                         │
│  └─ Case 模块（案例展示，含脱敏）★MVP 范围上调                       │
└───────────────┬──────────────────────────────────────────────────┘
                │
                ▼
┌──────────────────────────────────────────────────────────────────┐
│   PostgreSQL（关系表 + JSONB）                                       │
│   organizations / users / invites / routes / itinerary_quotes /     │
│   feedbacks / knowledge / cases                                      │
└──────────────────────────────────────────────────────────────────┘

部署：Node 容器 → 腾讯云 CloudBase 云托管（或 CVM + Docker）；
      Vue 静态产物 → 对象存储 + CDN / EdgeOne；
      环境变量：DATABASE_URL、WX_APPID、WX_SECRET、JWT_SECRET、H5_BASE_URL。
```

---

## 2. 数据模型（核心表）

> 约定：`org_id` 标识归属组织；`visibility` 字段与权限中间件配合实现字段级隔离。

### 2.1 organizations（组织）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | PK |
| type | enum | `primary`（一手）/ `agency`（境外旅行社）/ `provincial`（省地接社） |
| name | text | 组织名（PandaKing / 泰国A旅行社 …） |
| parent_primary_id | uuid? | 旅行社/省地接社归属的一手地接社（数据隔离铁律） |

### 2.2 users（用户/账号）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | PK |
| org_id | uuid | FK → organizations |
| role | enum | `primary_op` / `primary_admin` / `agency_sales` / `agency_admin` / `provincial_op` / `provincial_admin` |
| wechat_openid | text | 微信授权后写入（邀请制：首次打开 H5 授权即绑定） |
| invited_by | uuid? | 邀请人 |

### 2.3 routes（路线/客户脊柱）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | text | `C2026-001`（与 PRD 一致） |
| org_id | uuid | 创建方组织 |
| customer_name_en / cn | text | |
| country / contact / group_size / travel_date / destination | — | 见 PRD 4.1.1 |
| draft_payload | jsonb? | **旅行社发起的行程规划草案**（结构化按天）★v0.9.10 |
| status_key | enum | `await_primary_confirm` / `await_agency_revision` / `awaiting_quote` / `awaiting_feedback` / `awaiting_confirm` / `confirmed` / `lost` ★含新增两态 |
| version | int | 当前正式版本号 |
| created_by | uuid | |

### 2.4 itinerary_quotes（行程报价单）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | PK |
| route_id | text | FK → routes |
| days | jsonb | 按天行程（city/attractions/hotel/meals/transport） |
| quote_items | jsonb | 报价项（含 5 级价：cost① / profit② / agencyQuote③ / markup④ / touristQuote⑤） |
| cost_plan_a / profit_mode | — | 模式 A（成本+利润分解）/ 模式 B（含利润直接报价），数据层均存 cost①+profit② |
| version | int | 与 route.version 共享 |
| is_draft | bool | draft/published（草稿仅一手可见） |
| status_key | enum | 复用 routes 状态机 |

### 2.5 feedbacks（修改反馈）
| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | |
| route_id | text | |
| target_type | enum | `day` / `quote_item` / `overall` |
| target_ref | text | day 序号 / quote_item id |
| content | text | 反馈内容（可标注修改说明） |
| from_role | enum | 发起方角色 |

### 2.6 knowledge / cases
- `knowledge`：知识库条目（问答/沉淀）。
- `cases`：案例展示（由 confirmed 路线脱敏派生）；字段含 `is_published`、`desensitized`（客户真名/证件/精确日期/合同价不可公开）。

---

## 3. 核心 API 契约（REST）

> 基础前缀 `/api`；除公开 H5 外均需 `Authorization: Bearer <JWT>`。
> 权限中间件按 `user.role` 注入字段可见性（成本价①②仅 `primary_*` 可见）。

### 3.1 路线 / 客户
- `POST /api/routes` — 创建客户/路线（自动关联所属一手地接社）
- `GET /api/routes?status=&agency=&mode=` — 看板/列表（按角色过滤数据范围）
- `GET /api/routes/:id` — 详情（按角色剥离不可见字段）

### 3.2 行程规划草案（★v0.9.10 双向协作）
- `POST /api/routes/:id/draft` — 旅行社发起/编辑行程规划草案（jsonb：按天结构 + 预算区间）
- `POST /api/routes/:id/submit-to-primary` — 提交给一手地接社 → `status_key = await_primary_confirm`
- `POST /api/routes/:id/primary-confirm` — 一手**确认采用** → 草案转正为 itinerary_quote，route 转 `awaiting_quote`
- `POST /api/routes/:id/primary-feedback` — 一手**回传修改反馈** → route 转 `await_agency_revision`，旅行社可修订后再次 submit

### 3.3 行程报价单
- `PUT /api/routes/:id/itinerary-quote` — 编辑行程+报价（自动保存草稿，乐观更新）
- `POST /api/routes/:id/save-notify` — 保存并通知 → 版本+1、生成 H5 链接、复制摘要
- `GET /api/h5/route/:token` — 公开 H5（免登录，只读 + 反馈表单）

### 3.4 反馈 / 知识 / 案例
- `POST /api/routes/:id/feedback` — 提交修改反馈（关联 day/quote_item）
- `GET/POST /api/knowledge` — 知识库
- `POST /api/routes/:id/publish-case` — 确认路线脱敏后发布为案例（★MVP 含）

---

## 4. 权限矩阵实现（字段级可见性）

权限中间件逻辑（对应 PRD 4.7.1）：
- `primary_*`：全字段可见/可编辑；可见成本价①②。
- `agency_sales/admin`：可见 ③④⑤ + 客户联系信息；**不可见成本价①②**；可发起/编辑草案、提反馈、加价生成游客报价。
- `provincial_*`：仅可见分配给自己的行程需求 + 自己填的成本价①；**不可见 ②③④⑤ 及客户信息**；可编辑分配行程、填成本价、提行程规划反馈。
- 草案归属：发起方（`agency`）own；一手 `primary-confirm` 后转 `primary` own。
- 实现：`serialize(route, userRole)` 按角色裁剪 JSON 字段，DB 层不返回越权列。

---

## 5. 状态机实现

客户状态机（PRD 4.1.2，含 v0.9.10 新增两态）：
```
[咨询中] →(旅行社提交草案)→ [待一手确认] ⇄(回传反馈/修订重交)→ [待旅行社修订]
        →(一手确认采用)→ [待报价] →(发v1)→ [已报价] → … → [已确认] → [已成单]
```
- `status_key` 列驱动看板/列表筛选与 SLA 提醒（PRD 4.3.5）。
- 版本号仅 `save-notify` 递增；草稿独立标识。

---

## 6. 部署拓扑

| 组件 | 部署 | 说明 |
|---|---|---|
| Vue 3 静态产物 | 对象存储 + CDN / EdgeOne | `vite build` 输出 |
| Node API | 腾讯云 CloudBase 云托管（Docker）或 CVM | `Dockerfile` + `npm run start` |
| PostgreSQL | 腾讯云 PostgreSQL（或 CloudBase 云数据库 PostgreSQL） | 主从/备份 |
| 微信授权 | 公众号/服务号 `网页授权域名` 配置 | 需资质 |
| 环境变量 | 密钥管理（不入库） | DATABASE_URL / WX_*/ JWT_SECRET / H5_BASE_URL |

健康检查：`GET /api/health`；监控：容器日志 + 微信通知异常。

---

## 7. 风险与待办（审批前确认）

1. **案例展示脱敏合规**（MVP 含）：客户真名/证件/精确日期/合同价不可公开，发布前需脱敏校验开关。
2. **微信网页授权资质**：需认证服务号；MVP 内可直接用「邀请链接 + openid 绑定」模拟，正式环境再接 OAuth2。
3. **并发编辑**：MVP 不锁，后写覆盖 + 版本提示（PRD 4.2.17）。
4. **多语言**：H5 翻译 EN/ZH/TH/RU，翻译时机按 PRD Q6.1–Q6.3（保存并通知时生成译文快照）。

---

## 8. 审批结论（已批准 ✓）

> 审批时间：2026-07-11；审批人：产品负责人。已据此回写 **PRD v0.9.11**（案例展示拉回 MVP 一期 + 新增 2.3 技术栈与部署形态章节）。

- [x] 技术栈（Vue3 / Node+PG / NestJS）确认
- [x] 部署形态（CloudBase 云托管 + CDN）确认
- [x] MVP 含案例展示（脱敏合规 4.8.6）确认
- [x] 数据模型与 API 契约确认
- [x] 进入阶段 4（MVP 前端）开发

> 已批准，据此建立 `doc/` 模块文档、初始化仓库、搭建 Vue3 + NestJS + PostgreSQL 脚手架，并按 Feature 六段地图逐模块实现。
