# Code Spec：省地接社协作 H5 页面（成本询价闭环）

> 权威来源：`PRD_入境游定制协作工作台_v0.9.11.md`（v0.9 新增省地接社 H5 协作；v0.9.1 行程升级为可编辑；v0.9.2 术语统一为"可编辑"）+ `WORKBUDDY.md`。
> 配套 PRD 术语：**成本询价 H5 链接**（一手→省地接社）、**行程报价协作 H5 链接**（一手/旅行社，对客只读）。
> 关联代码：`frontend/src/views/H5ProvincialRoute.vue`、`frontend/src/utils/share.ts`、`frontend/src/api/h5.ts`、`backend/src/modules/routes/h5.controller.ts`、`backend/src/modules/routes/routes.service.ts`。

---

## 1. 概述与定位

省地接社协作 H5 是「闭环 B（你↔省地接社：成本询价协作）」的载体。一手 PandaKing 向省地接社**发送成本询价 H5 链接**，省地接社在微信内打开后：

- **查看**行程需求（按天展示，不含对客价/利润）
- **编辑**行程内容（城市/景点/住宿/餐饮，v0.9.1 起可编辑）
- **填写**地接成本①（按项目，利润默认 0）
- **回传**说明（可选），点「保存并回传一手」同步一手，且每轮生成「关键变更摘要」

PRD 明确要求该页**可编辑**（line 53/285/509/2447），绝非只读。

---

## 2. 页面标识与路由

| 项 | 值 |
|---|---|
| 前端路由 | `#/h5/provincial-route/:token`（Vue SPA hash 路由） |
| 渲染组件 | `H5ProvincialRoute.vue` |
| 链接构造 | `share.ts → provincialRouteH5Url(token)` = `window.location.origin + '/#/h5/provincial-route/' + token` |
| 数据端点 | `GET /h5/route/:token`（后端 `H5Controller.getRoute` → `svc.getH5`） |
| 保存端点 | `POST /h5/route/:token/edit`（后端 `H5Controller.editRoute` → `svc.provincialEdit`） |
| 鉴权 | **免登录**，链接即授权（token 含 `role:'provincial'` 与 `costInquiryId`） |

> 注意：与对客/旅行社只读 H5 不同——对客 H5 链接是 `shareH5Url(token)` = `API_ORIGIN + '/share/route/' + token`（**后端 SSR 只读页**，由 `H5Route.vue` 消费）。两者是**两套不同链接、两套不同组件、两种读写权限**。

---

## 3. 链接生成与分享流程（PandaKing 控制台侧）

入口：`RouteDetail.vue` 的「发起省地接社协作」面板（非「保存并通知」）。

```
PandaKing 在 RouteDetail 选择省地接社机构
  → onStartCollab()
  → createProvincialShare(routeId, provincialId)        // 后端建 provincial token + costInquiry
  → provincialRouteH5Url(res.token)                     // 构造 #/h5/provincial-route/:token
  → 附加 ?d=目的地&c=客户名（微信内一眼区分）
  → copyCollabLink() 复制到剪贴板 → 粘微信群给省地接社
```

- `createProvincialShare`（service line 314）：落 `ShareToken{ token, routeId, role:'provincial', costInquiryId }` + 一条 `costInquiry`（初始未提交）。
- 该 token 被 `getH5` 识别为 `role==='provincial'`，从而返回 `costInquiry` 供省地接社编辑（service line 535-541）。

---

## 4. 数据契约（`GET /h5/route/:token` 返回）

对应前端类型 `H5Route`（见 `frontend/src/types`）。省地接社页消费字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `customerNameCn` / `customerName` | string | 客户名（标题/通知用） |
| `destination` | string | 目的地 |
| `groupSize` | number | 人数 |
| `travelDate` | string? | 出行日期 |
| `statusKey` | enum | 路线状态（仅展示标签） |
| `guestPrice` | number? | 对客总价（**省地接社仅可见此聚合值，不可见利润②/对客明细**，见隔离规则） |
| `itinerary` | `{ days: Day[] }` | 行程需求；无版本时返回空行程（省地接社可新建第一天） |
| `version` | unknown? | 当前版本号（用于「基于 vN」摘要） |
| `costInquiry` | `{ id, status, cost1?, costItems? } \| null` | **省地接社专有的成本询价对象**；`status:'submitted'` 时回填 `costItems` |

前端 `H5ProvincialRoute.vue` 的 `onMounted`：
- `fetchH5Route(token)` → `data`
- `parseItinerary(d.itinerary)`：有 days 则映射，无则给 `[newDay(1)]`（**不会出现完全空白且无输入框**）
- 若 `costInquiry.status==='submitted'` 回填成本项；否则给默认 3 项（包车/酒店/门票）
- 记录 `initialCostItems` / `initialItinerary` 基线（多轮摘要用）

---

## 5. 页面 UI 逻辑（可编辑，非只读）

`H5ProvincialRoute.vue` 模板中，行程与成本区**全部为 `v-model` 双向绑定，无任何 `disabled` 守卫**：

- 行程：每天 `城市` input、增删 `景点`/`餐饮`、增删天数（`addDay/removeDay`）
- 成本①：`<QuoteTable v-model:items="quoteItems" role="provincial" />`，利润列强制 0
- 回传说明：`textarea v-model="fbText"`
- 主按钮：`保存并回传一手` → `onSubmitHandoff`

**关键不变量**：只要 `data` 加载成功（非 `notFound`、非 `loading`），页面对省地接社**始终可编辑**。页面只可能有三种可见态：
1. `loading` → "加载中…"
2. `notFound`（token 无效/失效）→ "协作链接无效或已失效"（**无输入框**）
3. `data` 成功 → 可编辑行程+成本（**有输入框且可编辑**）

> 推论：若省地接社看到的是「**输入框可见但不可编辑 + 内容空白**」，则该页面**不是** `H5ProvincialRoute.vue`（本组件渲染不出"不可编辑的输入框"），而是**对客只读 H5（`/share/route/:token` 由 `H5Route.vue`/SSR 渲染）**。

---

## 6. 保存与回传流程

```
onSubmitHandoff()
  → normalizeCostItems()            // 过滤空项，name 兜底"未命名"
  → payload = { itinerary, items? } // 每轮都带成本①（多轮协作：非仅首次）
  → editH5ProvincialRoute(token, payload)   // POST /h5/route/:token/edit → svc.provincialEdit
  → 若 fbText 非空：submitH5Feedback(token, note, '省地接社')  // 说明随回传一并提交
  → diffProvincialChanges(before/after)      // 计算本轮关键变更摘要
  → collabNotifyText({ changes, url: location.href })  // 生成带摘要的通知文案
  → copyText(text)                   // 复制到剪贴板，供粘微信群
```

`provincialEdit`（service line 356）：校验 token 的 `share.role==='provincial'`，将 itinerary 落版本、将 `items` 写入 `costInquiry.costItems` 并置 `status:'submitted'`。

---

## 7. 权限与数据隔离

- 省地接社 token 仅解析出**本路线**数据 + **本社 costInquiry**；跨社/跨路线查询在 service 层拦截（见 `WORKBUDDY.md` 4 安全红线）。
- 省地接社**可见** `guestPrice`（对客总价聚合），**不可见**利润②与对客报价明细（隔离矩阵）。
- 省地接社与境外旅行社互相不可见（PRD line 47/110）。

---

## 8. 通知文案（关键变更摘要）

每轮回传的微信文案由 `collabNotifyText(opts)` 构造，当 `opts.changes` 存在实质变更时追加「【本轮关键变更】」块：
- `基于 v<N>`（版本基线）
- 成本① 合计 `¥before → ¥after`（n 项变更）+ 逐项（新增/调价）
- 行程 `m → n 天` + 逐天城市变更（`D3 西安→京都` / `D5 东京(新增)`）

使一手无需点开逐页比对即可知本轮改了什么（多轮协作必需）。

---

## 9. 验收标准

- [ ] 一手经「发起省地接社协作」生成 `#/h5/provincial-route/:token` 链接，省地接社打开后**行程与成本①均可编辑**。
- [ ] 省地接社打开后页面**有内容**（至少含默认可编辑行程/成本项），非空白。
- [ ] 省地接社每轮「保存并回传一手」后，一手微信收到带「本轮关键变更」摘要的文案。
- [ ] 省地接社修改价格后每轮都实际回传最新成本①（无"仅首次"截断）。
- [ ] 跨社/跨路线数据不可互见；省地接社不可见利润②/对客明细。
- [ ] 无效/失效 token 打开显示"协作链接无效或已失效"，不报错白屏。

---

## 10. 已知问题 / Bug 分析（本次）

**现象**（用户报告）：PandaKing 分享的 URL 被省地接社打开后，「项目输入框不可编辑，项目内容也是空白的」。

**分析结论（已用代码证据锁定根因）**：
1. `H5ProvincialRoute.vue`（省地接社正确页）**渲染不出"不可编辑的输入框"**——其输入框全程 `v-model` 且无 `disabled`；且 `data` 成功时必带默认可编辑内容（§5 不变量）。因此"不可编辑+空白"**不可能是省地接社正确页**。
2. 唯一匹配该现象的页面是**对客只读 H5**：`shareH5Url(token)` = `API_ORIGIN + '/share/route/' + token`，由后端 SSR / `H5Route.vue` 渲染，**只读**、且对客视角内容（对客价/行程）在路线未就绪时显"空白"。
3. 后端 `getH5` 对 `role==='provincial'` token **正常返回** `itinerary`+`costInquiry`（service line 481-541）；`createProvincialShare` 创建的是合法 provincial token。省地接社页数据链路**无缺陷**。
4. 控制台存在两套链接生成：
   - 「发起省地接社协作」面板 → `provincialRouteH5Url` → **正确的可编辑省地接社链接**（§3）。
   - 「保存并通知」/「复制链接」按钮 → `shareH5Url` → **对客只读链接**（`/share/route/:token`）。

**根因（高置信）**：省地接社打开的是**对客只读 H5 链接**（`/share/route/:token`），即 PandaKing 误将「保存并通知」生成的**对客链接**发给了省地接社，而非从「发起省地接社协作」面板生成的**省地接社协作链接**。本质是一手侧**链接类型选错**（UX/流程可发现性问题），不是省地接社页本身的代码 bug。

**待确认/待决策（未擅自改动）**：
- 需向用户确认：PandaKing 当时点击的是「保存并通知」还是「发起省地接社协作」面板？（决定问题定性为"用法错误"还是"仍存代码缺陷"）
- 若定性为用法/流程问题，修复方向候选（需用户拍板，不擅自实施）：
  - A. 当路线已关联省地接社时，「保存并通知」生成的链接**改为省地接社协作链接**（而非对客链接）；
  - B. 在「发起省地接社协作」面板显式提示"此链接仅供省地接社打开，可编辑"，并与对客链接视觉区分；
  - C. 对客只读 H5 增加"识别到 provincial token 被以对客链接打开"的兜底提示（但 token 类型与链接前缀需对应，当前 provincial token 只能走 `#/h5/provincial-route/`）。

---

## 11. 修复实施（fix A + 后端幂等接口）✅ 已落地

**决策（用户拍板，2026-07-18）**：
1. 采用 **fix A**：当路线已关联省地接社（`route.provincialId` 存在）时，一手「保存并通知」生成的链接**自动改为省地接社协作链接**（可编辑），不再生成对客只读链接。
2. fix A 需后端支持才能干净实现 → 新增**幂等 get-or-create 省地接社协作端点**：同一 `route + 省地接社` 复用已有 token，不新建 `costInquiry`，杜绝"多次点击生成多个链接 / 多条询价记录"的数据风险。

**改动清单**：

### 后端
- `routes.service.ts` 新增 `ensureProvincialShare(routeId, provincialId?, principal?)`：
  - 校验 `principal.role === 'pandaking'`；解析 `effectiveProvincialId`（入参 > `route.provincialId`）。
  - 先 `routeShare.findFirst({ where: { routeId, role:'provincial', costInquiry:{ provincialId: effectiveProvincialId } } })`；命中则**复用**其 token，返回 `/h5/provincial-route/:token`。
  - 未命中则等同原 `createProvincialShare` 逻辑新建 token + `costInquiry`。
- `routes.controller.ts` 新增 `POST :id/provincial-share/ensure` → `svc.ensureProvincialShare`（鉴权同 create 端点）。
- 原 `createProvincialShare` 端点保留（向后兼容），未被移除。

### 前端
- `api/routes.ts` 新增 `ensureProvincialShare(routeId, provincialId?)` 封装 `POST /routes/:id/provincial-share/ensure`，返回 `ProvincialShare { token, link }`。
- `RouteDetail.vue`：
  - `onSaveNotify`：若 `data.provincialId` 存在 → `notify:false`（不生成对客孤儿链接）+ `ensureProvincialShare(id, provincialId)` → `provincialRouteH5Url(token)`；否则维持原对客 `shareH5Url` 逻辑。成功提示文案按角色区分。
  - `onStartCollab`：由 `createProvincialShare` 改为 `ensureProvincialShare`，保证「发起协作」重复点击也复用同一令牌（与 onSaveNotify 共用幂等逻辑，任意点击顺序都不会产生重复链接）。

**验证**：前端 `npm run build`（含 `vue-tsc` 类型检查）通过；后端 `tsc --noEmit` 通过。

**修复后效果**：
- 路线已关联省地接社时，一手点「保存并通知」→ 复制到剪贴板的是**可编辑的省地接社协作链接**，省地接社打开即可编辑行程与成本①，不再出现"只读+空白"。
- 无论先点「发起协作」还是先点「保存并通知」，同一 route+省地接社始终对应**唯一**协作链接与成本询价记录。

