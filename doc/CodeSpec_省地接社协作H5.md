# Code Spec：省地接社协作 H5 页面（成本询价闭环）

> 权威来源：`PRD_入境游定制协作工作台_v0.9.12.md`（v0.9 新增省地接社 H5 协作；v0.9.1 行程升级为可编辑；v0.9.2 术语统一为"可编辑"）+ `WORKBUDDY.md`。
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

---

## 12. 新一轮问题论证（v0.9.13 候选）—— 用户报告 3 个问题

> 用户诉求原文：① 省地接社作为协作方，可自由编辑项目名称（如 7座车、9座车、酒店）；② 省地接社作为协作方，利润项不显示、不用填写（目前默认 0、不可编辑，不如直接不显示更友好），直接填成本价格即可；③ 省地接社打开页面填写回传说明后点保存，提示"保存失败"。
> 纪律：先论证产品逻辑，确认后再改代码；任何不确定不猜。

### 12.1 问题 1：省地接社无法编辑「项目名称」

- **现象**：省地接社打开协作页，成本①表的「项目」输入框 disabled，无法改名（如 7座车/9座车/酒店）。
- **根因（100% 锁定）**：`frontend/src/components/QuoteTable.vue` 第 71–75 行
  `<input v-model="it.name" :disabled="!isPk" />`。省地接社 `isProv=true` → `isPk=false` → `!isPk=true` → 输入框禁用。该 disabled 把「项目名」编辑权仅留一手，违背 PRD「省地接社可自由编辑项目」与本次诉求。
- **产品逻辑论证**：
  - 成本①是**省地接社自己报的当地资源价**，项目名称（车型/酒店档位/门票类型）天然由地接定义，一手只关心汇总与利润①，无需抢占命名。
  - `agency`（境外旅行社）视图以「报价A」为自身成本基线、不改一手项目，**不应**编辑项目名。
  - 结论：编辑权 = 一手 + 省地接社；agency 仍 disabled。
- **修复方案（待确认）**：新增 `canEditName = (isPk || isProv) && !readOnly`，`:disabled="!canEditName"`。省地接社 `role="provincial"` 且 `readOnly` 默认 false → 可编辑。

### 12.2 问题 2：省地接社成本表冗余显示「利润① / 报价A」

- **现象**：省地接社页成本①表仍显示「利润①（¥0）」与「报价A」两列，利润锁 0 不可编辑。用户认为不如直接隐藏更友好。
- **根因（100% 锁定）**：`QuoteTable.vue` 第 63–64 行表头、第 86–96 行单元格、第 106–107 行 tfoot 合计，均用 `v-if="!isAgency"` 控制利润①/报价A 列显隐。对省地接社（`!isAgency=true`）仍显示这两列。这与 `backend/src/modules/routes/role-visibility.ts` 第 112–119 行「provincial 仅见 cost1」隔离规则以及 PRD 隔离矩阵冲突——纯属 UI 冗余，且会误导地接以为要填利润。
- **产品逻辑论证**：
  - 省地接社视角只需「项目 + 成本① + 合计」。利润①/报价A 是一手内部价与对客价，对地接无意义且违反隔离。
  - 隐藏后更聚焦、更不易误填；`agency` 仍显示（报价A=自身成本基线），`pandaking` 全显示。
  - 结论：利润①/报价A 列显隐条件由 `!isAgency` 改为「仅 pandaking 与 agency 可见」= `isPk || isAgency`（即 **provincial 隐藏**）。
- **修复方案（待确认）**：所有利润①/报价A 相关 `v-if="!isAgency"`（表头 2 处、单元格 2 处、tfoot 2 处）统一改为 `v-if="isPk || isAgency"`。省地接社列布局变为：`项目 | 成本① | (×)`；合计行：`合计 | 成本①合计 | (×列占位)`。

### 12.3 问题 3：省地接社点「保存并回传一手」提示"保存失败"

- **现象**：省地接社填回传说明后点保存，前端 `saveErr = '保存失败'`（`H5ProvincialRoute.vue` 第 229 行 `e?.response?.data?.message || '保存失败'` 兜底）。
- **静态分析已排除的路径**：
  1. **422 守卫 `share.costInquiry==null`**：页面能加载即 `costInquiry` 已关联 → 排除。
  2. **路由/URL 不匹配 / 代理吞 POST**：前端 `api/client.ts` `baseURL='/api'` → `POST /api/h5/route/:token/edit`；后端 `@Controller('h5') @Post('route/:token/edit')`。**页面加载（同路径 GET）正常** → POST 同样到达后端，路径/代理非根因（已排除 SPA 回源重写吞 POST 的假设）。
  3. **`recalcQuote` 抛错**：`role-visibility.ts` 中 `recalcQuote` 为纯计算、不抛错 → 排除。
  4. **版本号冲突**：`latestVersion` 取 `createdAt desc` 最新一条，`next=max数字+1`，正常不冲突 → 排除。
- **根因（待定，需实测报错）**：失败发生在 `provincialEdit`（`routes.service.ts` 第 411 行）的**写库路径**（GET 不写库故正常）。候选：
  - `routeVersion.create` / `routeVersion.update` / `costInquiry.update` 触发 Prisma 约束异常（如 P2025 记录不存在、字段缺失、唯一冲突）。
  - 注意：`onSubmitHandoff` 始终带 `itinerary`（`payload.itinerary = itinerary.value`），故 `input.itinerary != null` 恒真 → 每次保存都 `routeVersion.create`（新建版本 vN）；多轮回传持续新建版本。若某轮 `latest.id` 失效（并发/软删）会 P2025。
- **待用户提供（不猜测）**：浏览器 DevTools → Network → 点保存后 `edit` 请求的 **Response body**（含 `statusCode` / `message` / `error`），或 CloudBase 后端运行日志中的报错堆栈。拿到后精准修复。

### 12.4 待确认决策（未擅自改动）

| # | 决策点 | 推荐 |
|---|---|---|
| 1 | 省地接社可否编辑项目名 | 可（problem 1 修复） |
| 2 | 省地接社是否隐藏利润①/报价A 列 | 隐藏（problem 2 修复） |
| 3 | 问题 3「保存失败」修复 | 待用户提供实际报错后再改 |

### 12.5 修复实施（问题 1 + 问题 2，2026-07-19 已改代码，待构建验证）

**决策（用户拍板，2026-07-19）**：问题 1+2 按推荐全修；问题 3 等用户提供实际报错后单独处理。

**改动清单 `frontend/src/components/QuoteTable.vue`**：
- 新增 `canEditName = (isPk || isProv) && !readOnly`；项目名输入框 `:disabled="!isPk"` → `:disabled="!canEditName"`。**省地接社可编辑项目名**，`agency` 仍禁用。
- 利润①/报价A 列（表头 2 处、tbody 2 处、tfoot 2 处，共 6 处 `v-if="!isAgency"`）统一改为 `v-if="isPk || isAgency"`。**省地接社隐藏利润①/报价A 列**，仅见「项目 | 成本① | 删除」；`agency` 仍显示报价A（成本基线），`pandaking` 全显示。
- 成本①列（`<input v-if="!isAgency" v-model.number="it.cost1">`）保持不变：省地接社/一手见可编辑成本输入，agency 见只读 quoteA 基线。
- 顶部注释 `provincial：仅填成本①（利润锁 0）` → `（利润列隐藏）`。

**改动清单 `frontend/src/views/H5ProvincialRoute.vue`**：
- 成本①区注释与提示文案去掉「利润默认 0」（列已隐藏，措辞同步准确化）。

**验证**：`npm run build`（含 `vue-tsc` 类型检查）✅ 已跑通（8.44s，零错误；仅 RoutePdf 大 chunk 历史告警，与本改动无关）。
**部署**：本会话 CloudBase 凭证（TCB_ENV_ID/COS_SECRET_ID）缺失，未能自动推送；需用户在含凭证环境执行 `bash deploy/deploy.sh`（或控制台重传 dist）后，省地接社强刷（Ctrl+F5）实测。

**修复后省地接社视图**：成本①表 = `项目(可编辑) | 成本①(可编辑) | ×(可删除)` + 合计行 `合计 | 成本①合计 | ×列占位`；无利润①/报价A 冗余列。

### 12.6 问题 3「保存失败」根因分析与诊断增强（2026-07-19）

**现象**：省地接社页填写回传说明后点「保存并回传一手」，提示 `保存失败`（前端兜底文案 `e?.response?.data?.message || '保存失败'`）。

**静态排查（已逐条排除，均非根因）**：
1. ❌ CORS：`backend/src/main.ts` `app.enableCors()` 已开启；前端 `baseURL='/api'` 与 `setGlobalPrefix('api')` 前缀一致 → GET 与 POST 同源可达，POST 不会因预检被拦。
2. ❌ 路由/前缀：GET `/h5/route/:token`（页面能加载）+ POST `/h5/route/:token/edit` 同属 `H5Controller`，前缀与代理一致。
3. ❌ 422 守卫（`协作链接未关联成本询价`）：页面能加载即说明 `share.role==='provincial'` 且 `share.costInquiry!=null` 均成立，不会触发。
4. ❌ Prisma 列类型：`routeVersion.itinerary Json` / `quote Json?` / `costInquiry.cost1 Decimal` 与写入值完全匹配，`new Prisma.Decimal(...)` 正确。
5. ❌ `recalcQuote` / `hideCostsForRole`：纯计算，不抛错；`serializeVersion` 仅调 `hideCostsForRole`。
6. ❌ 版本号冲突：`latestVersion` 取 `createdAt desc` 最新一条，`parseInt(version.replace(/\D/g,''))+1` 正常递增，不触发唯一约束冲突。

**关键推断**：`保存失败` 仅当 `e?.response?.data?.message` 为假值时出现 → 即响应**不是 NestJS JSON**（无 `message`）。两种可能：
- (A) **请求根本无响应**（`e.response==null`）：被 CORS 预检或 `/api` 代理拦截（但 CORS 已开，故更可能是代理路径/方法问题）。
- (B) **响应是 HTML 字符串**（`typeof data==='string'`）：极可能是 **CloudBase 静态托管 SPA 回源重写 `/* → /index.html` 吞掉了这条更深的 POST**，而 GET 因路径/缓存命中未被吞。

**已落实的修复（诊断增强，非猜根因）**：`H5ProvincialRoute.vue:228` 的 catch 改为自诊断——按 `resp==null` / `typeof data==='string'` / `data.message` 三种情况给出精确中文提示（含「疑似被静态托管回源重写拦截，检查 /api 代理是否覆盖 POST」），并在 console 打印完整 error。用户强刷后再次保存即可看到真实失败原因，无需再抓 Network。

**待用户实测确认（纪律：不猜）**：省地接社链接 Ctrl+F5 强刷 → 点保存 → 页面会直接显示具体原因（HTTP 状态码 / 是否 HTML / 是否无响应）。据此再定修复（若为代理吞 POST，则去 CloudBase 控制台确认 `/api` 代理规则覆盖该 POST 路径；若为具体后端异常再对症改 `provincialEdit`）。

