# PRD：账号密码登录 + 链接凭证协作权限（v1.0）

> 版本：v1.0 ｜ 日期：2026-07-23 ｜ 状态：✅ 已定稿（v1.0）
> 关联文档：`PRD_入境游定制协作工作台_v0.9.13.md`（§2.3 技术栈、§3.1 角色定义、故事 6、账号权限分层）
> 作者视角：高级产品经理 + 全栈实现可行性评估
> ⚠️ **本文档已重写为「账号密码 + 链接凭证」主线，原「微信 OAuth + unionid」内容作废。** 微信能力整体降级为 Phase 2（见 §2.2 / §12）。

---

## 0. 文档目的

把现有「演示环境」（`DEV_BYPASS_AUTH` 注入 dev 用户、dev-login 按角色切换、协作者 H5 写操作挂在用户 JWT 后、`H5Invite` 收个名字不绑身份）升级为 **可上线的真实权限体系**：

- **PandaKing 超级管理员**：账号密码登录（bcrypt + 限流 + 首次改密）。
- **协作者（agency / provincial）**：链接即凭证（RouteShare / RouteIntake token），**免账号密码**，纯链接驱动协作。
- **对客 / 案例公开 H5**：免登录直接看。

落实 v0.9.13「未获邀请无法查看业务数据」的产品承诺，但**不依赖任何微信企业资质**（个人开发者当前不可得）。

---

## 1. 背景与现状缺口（已核实代码）

| 项 | 现状 | 缺口 |
|---|---|---|
| 管理员登录 | 仅 `dev-login` 按角色切换；`User` 无 `password` 字段 | **无真实账号密码登录** |
| 协作者 H5 写操作 | `agencyEdit`/`provincialEdit`/`saveVersion` 等挂在 `@CurrentUser`（用户 JWT）后 | **协作者无账号 → 无法以用户身份写** |
| 协作者身份 | `H5Invite.vue` 只收名字，`acceptInvite` 的 `openid` 始终为空 | **协作者从未有真实身份** |
| 链接过期 | `RouteShare.expiresAt` 已存在但生成时多为空 | 需落地 30 天默认有效期 |
| Token 时效 | `signToken` 无 `exp`，永不过期 | 需加 30d 有效期 |
| 停用失效 | `disableMember` 仅置 `disabled`，不吊销已发 token | 已发 token 靠自然过期失效 |
| 机构起草入口 | `@Post()` 建路线是 `@CurrentUser` 鉴权，无公开入口；但 `routes.service.ts:143-150` 已留「机构建路线」逻辑 | **缺「机构提交链接」公开入口** |

---

## 2. 范围（Scope）

### 2.1 In-scope（本期做）
1. **PandaKing 管理员账号密码登录（支持多管理员）**：`/api/auth/login`（手机号 + bcrypt 密码）、登录失败限流；种子账号用**固定弱密码 + `mustChangePwd=true`**（首次登录强制改密兜底）。登录后的管理员可在控制台「新增管理员」创建更多 `role=pandaking` 账号（**显示名称** + 手机号 + 初始密码，`mustChangePwd=true`），可禁用；多个 pandaking 权限完全对等，靠各自的**显示名称**在控制台列表与审计记录中区分。
2. **协作者链接即凭证**：新增 `ShareTokenGuard`，H5 写操作改用 RouteShare / RouteIntake token 鉴权（替代用户 JWT）；token 自带 `role + routeId`（+ `costInquiryId`），直接做归属与隔离。
3. **机构提交链接（route-intake，双向可发起）**：PandaKing 给每家境外旅行社预发常驻提交链接（`role='agency'` + `agencyId` 钉死）。**发起方可以是任意一方**：① 旅行社主动打开持有的链接，免登录起草路线初稿提交给你询价与规划确认；② 你（PandaKing）也可主动把该链接发给旅行社，请其填写/补充路线。两种方向最终都生成同一归属的 Route 流入你的看板。
4. **对客 / 案例公开 H5 免登录**：公开渲染 `public=true` 路线与案例。
5. **Token 30 天 JWT 无状态**；RouteShare / RouteIntake / Invite 链接默认 **30 天**有效期。
6. **物理隔绝强化**：协作 H5 服务端强制校验 token 归属（role/routeId/costInquiryId 匹配），前端隐藏按钮不替代后端校验。

### 2.2 Non-goals（本期不做）
- **微信网页授权 / 扫码登录 / unionid**（个人开发者无认证服务号、无开放平台网站应用资质，整体降级 **Phase 2**）。
- **协作者用户账号与两层级邀请**（agency/provincial 不建 `User` 行；现有 `Invite`/`acceptInvite` 用户注册链路在 MVP **搁置**，协作者改走链接凭证）。
- **短信验证码登录**（仅账号密码 + 链接两种凭证；手机号仅作登录标识，**不发送验证码**；短信签名需企业实名，个人不可得）。
- **管理员密码自助找回（邮件/短信验证码）**：MVP 不做；改用「另一管理员在控制台重置其密码」兜底（见 §5.1 / §11.2）。
- **主动 token 吊销 / 黑名单**（MVP 接受：停用 / 禁用链接后最多 30 天自然过期失效）。
- **多因子认证（MFA）**、**httpOnly cookie + CSRF**（MVP JWT 存 localStorage，接受 XSS 风险）。
- **微信小程序原生**（保持纯 H5）。
- **访问口令（passcode）**：MVP 不做链接口令；链接转发风险靠 30 天过期缓解，**Phase 2** 用微信 openid 绑定彻底防转发。

---

## 3. 角色与权限模型（重写）

### 3.1 三类凭证（关键转变）
| 角色 / 入口 | 凭证 | 是否需账号 | 鉴权方式 |
|---|---|---|---|
| **PandaKing 管理员**（PC 控制台） | 手机号 + 密码 | ✅ 需 `User`（role=pandaking） | `JwtAuthGuard`（JWT 带 role/agencyId/level） |
| **协作者 agency / provincial**（H5） | 分享 / 提交链接 token | ❌ 零账号 | `ShareTokenGuard`（token 自带 role/routeId/costInquiryId） |
| **对客 / 案例**（公开 H5） | 无 | ❌ | 无（仅渲染 `public=true`） |

### 3.2 身份与隔离（沿用 + 切换鉴权主体）
- **管理员身份主键**：`User.phone`（唯一，手机号）。`openid` 保留 `nullable`，Phase 2 微信回填。
- **协作者身份主键**：**链接 token**，不是人。机构身份在 token 生成时钉死：
  - `provincial`：每条链接 = 一个 `CostInquiry{provincialId}` + 一个 `RouteShare{costInquiryId}`；令牌解出 `costInquiryId → provincialId` 即机构。A/B 多机构 = 多 CostInquiry + 多 RouteShare，互不交叉（现有 schema 已支持，**无需改表**）。
  - `agency`：机构身份在 `Route.agencyId`（一个路线默认绑一家境外旅行社）；agency 提交链接在 `RouteIntake.agencyId`。
- **物理隔绝不变**：`agency ↔ provincial` 互不可见，靠后端 `role-visibility` 按 `share.role` / `share.costInquiryId` 过滤；隔离逻辑一行未变，仅鉴权主体从「用户」换「令牌」。
- **机构内分级**：MVP **压平（a）**——一个机构 = 一条 link，不做 admin/staff 区分（参见 §5.3 与决策表）。

---

## 4. 功能需求与用户故事

- **故事 1 — 管理员账号密码登录**
  > 作为【PandaKing 管理员】，我希望用手机号 + 密码登录控制台，以便安全地管理后台与机构。
- **故事 2 — 种子账号首次改密**
  > 作为【初始管理员】，我首次用种子密码登录后被强制改密，以便初始弱密码不长期留存。
- **故事 2b — 新增 / 禁用管理员**
  > 作为【已有管理员】，我希望在控制台新增 pandaking 同事账号（带显示名称）或禁用某账号，以便团队扩容、按名称区分与离职回收。
- **故事 2c — 管理员密码互重置**
  > 作为【管理员】，若同事忘记密码，我希望在控制台为其重置初始密码（对方下次登录强制改密），以便 MVP 无自助找回时的兜底。
- **故事 3 — 协作者链接即凭证协作**
  > 作为【境外旅行社 / 省地接社】，我希望打开 PandaKing 发的协作链接即可直接编辑行程与报价，以便无需注册账号就能对接。
- **故事 4 — 机构提交路线给 PandaKing（双向可发起）**
  > 作为【境外旅行社】，我希望用常驻提交链接免登录起草路线初稿并提交给 PandaKing，以便发起询价与规划确认；同样，作为【PandaKing】，我也希望主动把该链接发给旅行社请其填写。两种发起方向都落到同一归属路线。
- **故事 5 — 对客免登录查看**
  > 作为【游客 / 客户】，我希望直接打开对客 H5 查看行程与报价，以便无需任何授权。
- **故事 6 — 链接过期重发**
  > 作为【PandaKing】，协作 / 提交链接过期后我可一键重发新链接，以便无需手工重建。
- **故事 7 — 停用 / 禁用预期**
  > 作为【管理员】，我理解停用某管理员或禁用某链接后，其已有权限最多 30 天（token / 链接自然过期）失效，而非即时。

**非目标说明**：不为协作者提供「账号密码找回」「手机号登录」等；不建协作者 User 账号（避免扩大攻击面与合规成本）。

---

## 5. 关键流程

### 5.1 管理员 PC 登录（账号密码）
```
控制台登录页 → POST /api/auth/login { phone, password }
  → 查 User(phone, role=pandaking, disabled=false)
  → bcrypt.compare(password, hash)：
        失败（带限流，连续 N 次锁定） → 401
        成功 → 若 mustChangePwd=true → 返回 { requireChangePwd:true }，前端强制改密页
              → POST /api/auth/change-pwd { oldPwd, newPwd } 改密后 mustChangePwd=false
        签发 JWT(30d, payload: sub=userId, role, agencyId, level)
  → 前端存 JWT（localStorage），进入控制台

管理员开通 / 互重置（控制台，需 JWT + pandaking）：
  POST /api/auth/admins { name, phone, initPwd }
    → 建 User(role=pandaking, name, password=bcrypt(initPwd), mustChangePwd=true, disabled=false)
    → 返回新管理员（含 name，不含密码哈希）
  POST /api/auth/admins/:id/reset-pwd { initPwd }
    → 重置为初始密码，mustChangePwd=true（对方下次登录强制改密；MVP 无自助找回的兜底）
  POST /api/auth/admins/:id/disable
    → disabled=true（其已发 JWT 靠 30d 过期失效，不立即吊销）
  约束：至少保留 1 个可用管理员（禁止禁用/删除最后一个 enabled pandaking）
```

### 5.2 协作者 H5 链接即凭证（写操作）
```
打开 /h5/route/:token（协作）或 /h5/intake/:token（提交）
  → ShareTokenGuard 解析 token：
        RouteShare：查 token 存在 + !expiresAt过期
                     取出 share.role / routeId / costInquiryId 挂到请求上下文
        RouteIntake：查 token 存在 + !expiresAt过期 → 取出 agencyId
        不存在/过期 → 401/403「链接无效或已过期」
  → 渲染按 share.role 的可见性（agency=利润②+行程；provincial=成本①+行程；public=对客价）
  → 写操作（agencyEdit / provincialEdit / saveVersion / 反馈）改用 share 上下文做归属与隔离
     不再要求协作者有 User 账号
```

### 5.3 机构提交链接（双向发起）
```
PandaKing 在机构目录选「境外旅行社 A」→ 生成常驻提交链接：
    POST /api/routes/intake-link { agencyId:A } → 建 RouteIntake{ token, agencyId:A, expiresAt:+30d }
    链接如 /h5/intake/:token，发给旅行社 A 长期持有
【发起方可以是任意一方】
  方向① 旅行社主动发起：旅行社 A 打开持有的链接（免登录）→ 起草路线初稿（客户/目的地/行程/初步报价）→ 提交
  方向② PandaKing 主动发起：PandaKing 主动把该链接发给旅行社，请其填写/补充路线（例如客户已口头委托，请你代拉起草稿）
  两种方向都走同一入口：
    POST /api/routes/intake { token, draft }
      → ShareTokenGuard 校验 token → 建 Route：
            agencyId = token.agencyId (=A)
            createdById = 种子 PandaKing（机构无账号）
      → 该 Route 落入 PandaKing 看板（看板对 pandaking 不过滤 agencyId，全可见，显示归属「A」）
PandaKing 规划 + 核算利润①/成本① → 回发加价链接给 A（A 加利润②回传）→ 发成本询价链接给省地接社
（多轮协作闭环，同图 § 业务流程）
```
> 机构内分级（压平 a）：一个机构 = 一条提交链接 + 一条协作链接；机构内部谁用由对方自管链接分发，不做 admin/staff。

### 5.4 对客 / 案例公开 H5（免登录）
- 公开渲染 `public=true` 的路线分享与案例；行为以 **share token 维度**记录（打开/查看），不强制身份。

---

## 6. 数据模型变更（Prisma）

> 迁移一律用 `migrate diff` 手写 SQL + `migrate deploy`（**禁止 `migrate dev`**，云账号无建库权限）。

### 6.1 `User` 模型（仅服务 pandaking 管理员）
```prisma
model User {
  id            String    @id @default(uuid())
  name          String                  // 管理员显示名称（必填；多管理员靠此区分，如「张三-运营」「李四-财务」）
  phone         String   @unique   // ★新增：管理员登录键（手机号，必填唯一）；MVP 仅 pandaking 用
  email         String?              // 可选联系邮箱（非登录键，不再唯一）
  password      String?              // ★新增：bcrypt 哈希；仅 pandaking 管理员有
  mustChangePwd Boolean   @default(true) // ★新增：种子账号首次改密
  role          Role      @default(pandaking) // ★MVP 实际仅 pandaking
  agencyId      String?
  agency        Agency?   @relation(fields: [agencyId], references: [id], onDelete: SetNull)
  level         RoleLevel @default(admin)
  parentId      String?
  openid        String?   @unique   // 保留 nullable，Phase 2 微信回填
  disabled      Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  createdRoutes Route[]   @relation("RouteCreatedBy")
}
```
- 迁移要点：去除 `email` 唯一约束、新增 `phone String @unique`（必填唯一，作为登录键）；新增 `password`、`mustChangePwd`；默认 `role` 改为 `pandaking`（历史 agency/provincial 行若残留不影响，MVP 不再新建）。

### 6.2 新增 `RouteIntake` 模型（机构提交链接）
```prisma
model RouteIntake {
  id          String   @id @default(uuid())
  token       String   @unique
  agencyId    String   // 归属机构 org id（钉死，提交时用作 Route.agencyId）
  createdById String   // 发链接的 PandaKing 管理员
  expiresAt   DateTime
  createdAt   DateTime @default(now())
}
```

### 6.3 `Invite` 模型（MVP 搁置）
- 现有两层级 `Invite`/`acceptInvite` 用户注册链路在 MVP **不启用**（协作者零账号）。保留表结构不动，避免迁移风险；后续若恢复协作者账号体系再启用。

### 6.4 Token
- JWT payload 增加 `exp`（30 天）；`signToken` 传 `expiresIn: '30d'`。
- 无状态：不存 DB；`disabled` / 链接禁用靠 `exp` 自然失效（Non-goal）。

---

## 7. 接口契约（新增 / 修改）

| 方法 | 路径 | 说明 | 鉴权 |
|---|---|---|---|
| POST | `/api/auth/login` | `{phone,password}` → bcrypt 校验 → `{token,user,requireChangePwd}` | 否 |
| POST | `/api/auth/change-pwd` | `{oldPwd,newPwd}` 首次/主动改密 | 否（凭一次性登录态或旧密码） |
| GET | `/api/auth/me` | 当前管理员 | 是（JWT） |
| GET | `/api/auth/admins` | 管理员列表（pandaking，含 name/phone/disabled） | 是（JWT） |
| POST | `/api/auth/admins` | `{name,phone,initPwd}` 新增 pandaking 管理员 | 是（JWT） |
| POST | `/api/auth/admins/:id/reset-pwd` | `{initPwd}` 重置某管理员密码 | 是（JWT） |
| POST | `/api/auth/admins/:id/disable` | 禁用某管理员（保留≥1 可用） | 是（JWT） |
| POST | `/api/routes/intake-link` | `{agencyId}` 生成机构常驻提交链接 | 是（pandaking） |
| POST | `/api/routes/intake` | `{token,draft}` 机构免登录提交路线初稿 | **否（ShareTokenGuard）** |
| GET/POST | `/h5/route/:token` 相关写操作 | agencyEdit/provincialEdit/saveVersion/反馈 | **否（ShareTokenGuard）** |
| GET | `/h5/intake/:token` | 机构提交 H5（免登录） | 否（ShareTokenGuard） |
| POST | `/api/auth/dev-login` | 开发态角色切换（**保留**，仅非 production） | 否 |
| GET/POST | 现有 invites / 成员 / 机构管理 | 控制台内 pandaking 用 | 是（JWT） |

**守卫**：新增 `ShareTokenGuard`（从 URL/Body 取 token，校验存在/过期，挂 share 上下文）；`JwtAuthGuard` 增加 `exp` 校验；`DEV_BYPASS_AUTH=true` 仅当 `NODE_ENV !== 'production'` 注入 dev 用户，生产一律 401。

---

## 8. 安全与合规

- **密码**：bcrypt（cost≥10）哈希；登录失败限流（如 5 次/10 分钟锁定）；密码最小长度策略。**种子密码**：固定弱密码（常量或环境变量 `SEED_ADMIN_PWD` 可覆盖，默认文档化弱值）+ `mustChangePwd=true`，首次登录强制改密，弱密码不长期留存。**管理员密码找回**：MVP 不做自助找回（无邮件/短信）；改由另一管理员在控制台重置其初始密码（对方下次登录强制改密）。
- **链接即凭证的代价与缓解**：链接可转发/泄露 → 30 天过期（MVP 唯一缓解）+ Phase 2 绑微信 openid 彻底防转发。
- **Token 存储**：JWT(30d) 存 `localStorage`（MVP 接受 XSS 风险；httpOnly cookie 列为后续优化）。
- **失效模型**：停用 / 禁用靠 30d 过期，不做主动吊销（已声明 Non-goal）。
- **个人信息最小化**：协作者不采集姓名/手机号等（填写人 `authorName` 为可选自填）；`openid` 留 nullable 待 Phase 2 最小采集。
- **公开边界**：对客 H5 不含成本①/利润等业务敏感字段（沿用 `role-visibility` 的 public 视图）。
- **防越权**：协作 H5 的 token 归属校验在服务端强制执行；HTTPS 全站（生产已上云托管）。

---

## 9. 指标体系

| 类型 | 指标 | 基线 | 目标 |
|---|---|---|---|
| 驱动 | 管理员登录成功率（login / 尝试） | - | ≥ 95% |
| 驱动 | 机构提交链接使用率（intake 提交 / 发出链接） | - | ≥ 60% |
| 驱动 | 协作者链接访问成功率（有效 token / 打开） | - | ≥ 90% |
| 健康 | 越权 / 无效链接拦截数（401/403） | 0（演示期） | 上线后监控异常峰值 |
| 健康 | 30 天续登率（管理员 token 未过期即二次访问） | - | ≥ 70% |

---

## 10. 依赖与风险

- **前置依赖（已确认）**：个人开发者无企业资质 → 微信网页授权 / 扫码 / unionid **Phase 2**；本期完全不依赖微信，纯账号密码 + 链接凭证可独立上线。
- **风险 R1**：链接转发泄露 → 缓解：30d 过期（MVP）+ Phase 2 绑 openid 彻底防转发（口令已明确不做 MVP）。
- **风险 R2**：`phone` 加 `@unique`（必填）迁移时需确保历史无重复非空值 → 迁移前清洗 `phone`（demo 阶段通常无数据，直接建表即可）。
- **风险 R3**：Prisma 迁移误操作毁库 → 按项目规范禁 `migrate dev`，用 `migrate diff` 手写 + 备份。
- **风险 R4**：localStorage JWT 的 XSS 风险 → MVP 接受，后续评估 httpOnly cookie。

---

## 11. 实现资源与里程碑

### 11.1 后端（约 3–4 人日）
- `User` 模型迁移（phone unique + password + mustChangePwd）；`RouteIntake` 新建。
- `auth.service/controller`：`login(phone,password)` + bcrypt + 限流 + `change-pwd`；新增 `POST /api/auth/admins`（创建 pandaking，含 `name`）、`reset-pwd`、`disable`（含「保留≥1 可用」校验）；`signToken` 加 `exp`；种子账号写 `mustChangePwd=true` + 固定弱密码（可 env 覆盖）。
- 新增 `ShareTokenGuard`；`routes.controller` 新增 `POST /routes/intake-link`、`POST /routes/intake`；H5 写接口从 `@CurrentUser` 切到 token 上下文。
- `Invite.expiry` 7d→30d（如仍保留入口）；`JwtAuthGuard` 加 `exp`。

### 11.2 前端（约 3–4 人日）
- 控制台登录页（手机号+password）+ 首次改密页；保留 `dev-login` 开发态；路由守卫按 token 失效跳登录。
- 控制台「管理员管理」页：列表（显示名称 + 手机号 + 状态）+ 新增（**名称**+手机号+初始密码）+ 重置密码 + 禁用（禁用手前校验仍有≥1 可用）。
- 机构路线提交 H5（`/h5/intake/:token` 免登录起草表单）。
- 协作 H5 改造：写操作携带 token（替代 JWT）。
- 控制台「生成机构提交链接」「协作链接重发」入口。

### 11.3 联调与上线（约 1–2 人日）
- 本地双轨联调；Prisma 安全迁移 + 生产部署；强刷验证。

---

## 12. 决策追溯表（全部已锁定）

| 决策点 | 结论 |
|---|---|
| 管理员登录方式 | 手机号 + 密码（bcrypt + 限流 + 首次改密） |
| 协作者（agency/provincial）登录 | 链接即凭证，免账号密码（方案 A） |
| 机构内分级 | 压平（a）：一个机构 = 一条 link |
| 机构如何区分 | 链接生成时钉死：provincial→`costInquiryId→provincialId`；agency→`Route.agencyId` / `RouteIntake.agencyId` |
| 真实主流程方向 | **双向可发起**：旅行社可持常驻提交链接主动发草稿给你询价；你（PandaKing）也可主动把该链接发给旅行社请其填写。两种方向同落一条归属 Route |
| 提交链接归属 | PandaKing 预发常驻链接，机构持有使用（机构零账号） |
| 对客 / 案例公开 H5 | 免登录直接看 |
| Token 策略 | 30 天 JWT 无状态 |
| 邀请 / 链接有效期 | 30 天 |
| 微信能力 | 整体降级 **Phase 2**（资质就绪再接：openid 回填 / 扫码 / unionid） |
| 初始管理员密码 | 固定弱密码（可 env `SEED_ADMIN_PWD` 覆盖）+ `mustChangePwd` 首次强制改密兜底 |
| 多管理员 | 支持多个 `role=pandaking`（权限对等）；每个管理员带独立**显示名称**区分（控制台列表 / 审计）；控制台「新增管理员」开通 + 可禁用；一人忘密码由另一人重置（MVP 无自助找回的兜底） |
| 访问口令（passcode） | MVP 不做；链接转发风险靠 30d 过期缓解，Phase 2 用 openid 绑定防转发 |
