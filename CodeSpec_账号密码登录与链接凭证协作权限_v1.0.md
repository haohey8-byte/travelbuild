# CodeSpec：账号密码登录 + 链接凭证协作权限（v1.0）

> 版本：v1.0 ｜ 日期：2026-07-23 ｜ 状态：编码前业务规则与代码契约
> 上游文档：`PRD_账号密码登录与链接凭证协作权限_v1.0.md`（已定稿）
> 适用代码根：`/d/workbuddy-project/`（后端 `backend/`，前端 `frontend/`）
> 本文档目标：把 PRD 的产品决策翻译为**可直接编码的业务规则、数据迁移、接口契约、守卫逻辑、错误码、校验规则、前端改造点与验收标准**。编码前以本文件为准；与 PRD 冲突以 PRD 决策表（§12）为准。

---

## 0. 边界与定位

- **本 CodeSpec 包含**：业务规则（允许/拒绝/边界）、Prisma 精确迁移、接口请求/响应字段、错误码、守卫逻辑、服务方法签名、前端改造点、安全规则、迁移与部署步骤、DoD。
- **本 CodeSpec 不包含**：UI 像素稿、Phase 2 微信能力、密码自助找回（邮件/短信）、MFA、httpOnly cookie。
- **已锁定的产品决策（来自 PRD §12）**：管理员=手机号+密码；协作者=链接即凭证（零账号）；机构提交链接双向可发起、PandaKing 预发常驻；对客 H5 免登录；Token 30 天 JWT、链接 30 天；多管理员（带显示名称、互重置、可禁用、至少留 1 个）；口令(passcode)不做；微信整体 Phase 2。

---

## 1. 实现前代码现状（已核实，防过度实现/防回归）

| 能力 | 现状（文件:行） | 编码动作 |
|---|---|---|
| JWT 签发 | `auth.module.ts:9-14` 签 `expiresIn:'7d'`；`auth.service.ts:41-55` `signToken` 未显式传过期 | **改 30d** |
| 管理员登录 | 仅 `dev-login`；`User` 无 `password` | **新增 `login(phone,password)`** |
| `User` 模型 | `schema.prisma:48-62` 有 `name/role/agencyId/level/openid?/email?/disabled`，**无 phone/password/mustChangePwd** | **迁移加字段** |
| `RouteShare.expiresAt` | 字段已存在(`schema.prisma:174`)；但 `routes.service.ts:332/392` 生成时**不赋值** | **生成处补 +30d** |
| `agencyEdit`/`provincialEdit`/反馈 | `h5.controller.ts` 用 URL `:token` 鉴权，**无 Guard**，service 内部已校验 token | **保持，仅补 expiresAt** |
| 控制台写操作 | `routes.controller.ts` 类级 `JwtAuthGuard`+`@CurrentUser`（saveVersion/doInquire 等） | **保持**（管理员登录后自动可用） |
| 机构提交入口 | `@Post()` 建路线需 `@CurrentUser`；无公开 intake 入口 | **新增 `POST /routes/intake` + `POST /routes/intake-link`** |
| 前端 auth | `api/auth.ts` 无 login/changePwd/admins；`stores/auth.ts` 存 `localStorage['token'/'user']`；`client.ts` 自动加 Bearer；**无登录页/路由守卫** | **新增登录页/改密页/管理员页/intake H5/路由守卫** |
| `createRoute` 机构归属 | `routes.service.ts:141-154` 已为 `agency` 机构账号建路线留逻辑 | intake 走**新端点**（无 JWT principal） |

**关键约束（用户强约束）**：个人开发者无企业微信资质 → 不接任何微信 OAuth；不发送短信验证码；链接转发风险仅靠 30 天过期缓解。

---

## 2. 数据模型精确变更（Prisma + 迁移 SQL）

> 迁移一律 `migrate diff` 手写 SQL + `migrate deploy`（**禁 `migrate dev`**，云账号无建库权）。剔除 `tencentdb_tbl_dial_test_*` 的 DROP。用 backend 本地二进制（禁 pnpm）。

### 2.1 `User` 模型变更
```prisma
model User {
  id            String    @id @default(uuid())
  name          String                  // 显示名称（必填；多管理员靠此区分）
  phone         String   @unique        // ★新增：登录键（手机号，必填唯一）
  email         String?                 // 可选联系邮箱（非登录键，保持可空、非唯一）
  password      String?                 // ★新增：bcrypt 哈希；仅 pandaking 有
  mustChangePwd Boolean   @default(true)// ★新增：种子/重置后强制改密
  role          Role      @default(pandaking) // 默认改 pandaking（MVP 实际仅 pandaking）
  agencyId      String?
  agency        Agency?   @relation(fields: [agencyId], references: [id], onDelete: SetNull)
  level         RoleLevel @default(admin)    // pandaking 默认 admin
  parentId      String?
  openid        String?   @unique         // 保留 nullable，Phase 2 回填
  disabled      Boolean   @default(false)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  createdRoutes Route[]   @relation("RouteCreatedBy")
}
```

**迁移 SQL（顺序执行，兼容存量 demo 行）：**
```sql
-- 1) phone 先加可空列
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
-- 2) 存量行回填唯一占位（MVP 仅 pandaking 用 phone，agency/provincial 用占位避免唯一冲突）
UPDATE "User" SET "phone" = 'legacy_' || "id" WHERE "phone" IS NULL;
-- 3) 置非空 + 唯一
ALTER TABLE "User" ALTER COLUMN "phone" SET NOT NULL;
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
-- 4) 新增密码与改密标记
ALTER TABLE "User" ADD COLUMN "password" TEXT;
ALTER TABLE "User" ADD COLUMN "mustChangePwd" BOOLEAN NOT NULL DEFAULT true;
-- 5) role 默认值改 pandaking（不影响存量行）
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'pandaking';
```
> 风险 R2（PRD §10）：若存量有重复非空 phone，步骤 2 已用 `legacy_<id>` 保证唯一，故不会冲突。生产库若有真实重复需手工清洗。

### 2.2 新增 `RouteIntake` 模型（机构提交链接）
```prisma
model RouteIntake {
  id          String   @id @default(uuid())
  token       String   @unique
  agencyId    String                 // 归属机构 org id（钉死，提交时作 Route.agencyId）
  createdById String                 // 发链接的 PandaKing 管理员 id
  expiresAt   DateTime               // 30 天过期
  createdAt   DateTime @default(now())
  @@index([agencyId])
}
```
**迁移 SQL：**
```sql
CREATE TABLE "RouteIntake" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "agencyId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "RouteIntake_token_key" ON "RouteIntake"("token");
CREATE INDEX "RouteIntake_agencyId_idx" ON "RouteIntake"("agencyId");
```

### 2.3 `RouteShare.expiresAt` 落地规则（**不**改 schema，仅改 service 生成逻辑）
- 字段已存在（`schema.prisma:174`）。
- **新建 share 一律设 `expiresAt = now + 30d`**：在 `createShare`(`routes.service.ts:332`)、`createProvincialShare`(:392)、`doInquire` 关联 share 生成处补 `expiresAt`。
- **存量 share（`expiresAt IS NULL`）视为「长期有效」**（兼容历史链接，不强制失效）。读取校验见 §3.2。

### 2.4 `CostInquiry` 处理
- 省地接社 H5 经 `RouteShare{costInquiryId}` 进入，过期由 `RouteShare.expiresAt` 控制；`CostInquiry.token` 为内部令牌，**不加 expiresAt**（避免双控）。保持现状。

### 2.5 `Invite` 模型
- 保留不动（MVP 不启用协作者账号体系）。

---

## 3. 后端业务规则

### 3.1 Auth 模块（`auth.service.ts` / `auth.controller.ts`）

#### 3.1.1 `login(phone, password)` — 手机号+密码登录
- **请求**：`POST /api/auth/login` `{ phone: string, password: string }`（无 Guard）
- **业务规则**：
  1. 校验 `phone` 匹配 `^1[3-9]\d{9}$`；`password` 非空（否则 400 VALIDATION）。
  2. 查 `User` where `{ phone, role: 'pandaking', disabled: false }`。
  3. **不区分"无此号 / 已禁用 / 非管理员"** → 一律返回 `401 AUTH_INVALID_CREDENTIALS`（防账号枚举）。
  4. `bcrypt.compare(password, hash)`：失败 → 触发限流计数 → `401`。
  5. 成功 → 签发 JWT(30d)；若 `mustChangePwd=true` → 响应 `{ token, user, requireChangePwd: true }`（前端强制跳改密）；否则 `{ token, user }`。
- **限流规则**：基于键 `(phone + IP)` 的滑动窗口，**5 次失败 / 10 分钟**锁定，锁定期内返回 `429 AUTH_LOCKED`（带 `Retry-After`）。MVP 限流存储用**进程内 LRU Map**（CloudBase 单实例足够）；多实例需 Redis（列 Phase 2）。
- **bcrypt**：`cost = 12`（≥10）。

#### 3.1.2 `change-pwd(oldPwd, newPwd)` — 改密（含首次强制改密）
- **请求**：`POST /api/auth/change-pwd` `{ oldPwd, newPwd }`（需 `JwtAuthGuard`，即已持登录态 JWT）
- **业务规则**：
  1. 校验 `oldPwd` 与当前 `User.password` 匹配（否则 401）。
  2. `newPwd` 强度：长度 ≥ 8（建议含字母+数字，前端提示但不强制复杂度）。
  3. 更新 `password = bcrypt(newPwd)`，`mustChangePwd = false`。
  4. 不强登出（JWT 仍有效）；下次登录 `requireChangePwd=false`。
- **边界**：首次改密时用户已持登录返回的 JWT（§3.1.1 仍签发 token），用该 JWT 调此接口即可，无需二次登录。

#### 3.1.3 管理员管理（均 `JwtAuthGuard`，且调用者 `role=pandaking`）
- `GET /api/auth/admins` → 返回 pandaking 列表视图：`{ id, name, phone(masked), disabled, mustChangePwd, createdAt }`（**脱敏**：`phone` 落库全量，列表返回 `138****0000`）。
- `POST /api/auth/admins` `{ name, phone, initPwd }`：
  - 校验 `name` 非空；`phone` 匹配手机号正则且**全局唯一**（冲突 409 `ADMIN_PHONE_EXISTS`）；`initPwd` ≥ 8。
  - 建 `User{ role:'pandaking', name, phone, password:bcrypt(initPwd), mustChangePwd:true, disabled:false, level:'admin' }`。
  - 返回脱敏视图（**绝不返回 password 哈希**）。
- `POST /api/auth/admins/:id/reset-pwd` `{ initPwd }`：
  - 重置 `password=bcrypt(initPwd)`，`mustChangePwd=true`（对方下次登录强制改密；MVP 无自助找回兜底）。
  - **不主动吊销对方已发 JWT**（靠 30d 过期）。
- `POST /api/auth/admins/:id/disable`：
  - 校验 `id != 当前用户`（否则 400）。
  - 校验禁用后**仍有 ≥ 1 个 enabled pandaking**（否则 400 `ADMIN_LAST_ONE`）。
  - 设 `disabled=true`。已发 JWT 靠 30d 过期失效（Non-goal：不做主动吊销）。

#### 3.1.4 种子账号（`seed.ts` 改造）
- 造**至少 1 个** pandaking 主管理员（用户要 2 个时，第二个在控制台「新增管理员」开通；seed 亦支持 env 配第二个可选）。
- 字段：`phone = process.env.SEED_ADMIN_PHONE || '13800000000'`；`password = bcrypt(process.env.SEED_ADMIN_PWD || 'Pandaking@2026')`；`mustChangePwd = true`；`name = '主管理员'`；`role='pandaking'`；`level='admin'`。
- **幂等**：按 `phone` 查重，存在则 `upsert`（补 password/mustChangePwd，不改 name/phone）；不存在则建。
- 首次部署必须跑 seed（生产库用 backend 本地二进制 `tsx prisma/seed.ts`）。

#### 3.1.5 `signToken` 调整
- `auth.module.ts` `signOptions.expiresIn` 由 `'7d'` → `'30d'`（payload 已含 sub/role/name/agencyId/level，无需改 `signToken` 签名）。

#### 3.1.6 保留 `dev-login`
- 保持 `POST /api/auth/dev-login`，仅 `DEV_BYPASS_AUTH==='true'` 或非 production 可用（现有逻辑不动），供本地联调。

### 3.2 `ShareTokenGuard`（新增，用于 intake 端点）
- **token 解析优先级**：① 路由参数 `:token` → ② query `?token=` → ③ body `token` → ④ header `x-share-token`。
- **两类令牌判定**：
  - **RouteShare**：`findUnique({token})` → 校验 `存在` 且 `(expiresAt IS NULL OR expiresAt > now)` → 挂 `req.share = { role, routeId, costInquiryId, public, versionId }`。
  - **RouteIntake**：`findUnique({token})` → 校验 `存在` 且 `expiresAt > now` → 挂 `req.intake = { id, agencyId, createdById }`。
  - 失败 → `401 SHARE_INVALID`（无效）/ `401 SHARE_EXPIRED`（过期）。
- **应用范围**：仅用于**新增的 intake 端点**（`POST /routes/intake`）。现有 `h5.controller.ts` 的 agencyEdit/provincialEdit/反馈已自行在 service 内校验 token（正确），**不重复加 Guard**，避免回归。

### 3.3 Routes 模块改造

#### 3.3.1 新增 `POST /routes/intake-link` — 生成机构常驻提交链接
- Guard：`JwtAuthGuard`（调用者 `role=pandaking`）。
- 请求 `{ agencyId: string }`；校验 agency 存在且 `role='agency'`（否则 400）。
- 建 `RouteIntake{ token: genToken(), agencyId, createdById: user.id, expiresAt: now+30d }`。
- 返回 `{ token, link: '/h5/intake/'+token }`。

#### 3.3.2 新增 `POST /routes/intake` — 机构免登录提交路线初稿
- Guard：`ShareTokenGuard`（intake 类型）。
- 请求 `{ token, draft: RouteDraftInput }`（draft 字段复用 `CreateRouteInput` 子集：customerName/customerNameCn/country/agency/destination/groupSize/travelDate/itinerary/quote 初稿等）。
- 业务规则：
  1. 从 `req.intake` 取 `agencyId`。
  2. 建 `Route`：`agencyId = intake.agencyId`；`createdById = 种子 PandaKing 的 id`（查询 `role='pandaking' AND disabled=false` 取 `createdAt` 最早者；若无可建则报 500 配置错误）；其余字段来自 draft。
  3. **物理隔绝**：Route 归属 `agencyId` 钉死，无任何 JWT principal 注入。
  4. 返回 `{ routeId }`；该 Route 落入 PandaKing 看板（看板对 pandaking 不过滤 agencyId，全可见，显示归属机构名）。
- **双向发起一致性**：方向①（旅行社主动）与方向②（PandaKing 主动发链接请其填）都走此端点，落同一条 `agencyId` 钉死的 Route。

#### 3.3.3 现有写操作（保持，仅补 expiresAt）
- 控制台：`saveVersion`/`doInquire`/`share`/`submit`/`confirm` 等 → 维持 `JwtAuthGuard`+`@CurrentUser`（管理员登录后自动可用）。
- H5：`agencyEdit`/`provincialEdit`/反馈（`h5.controller.ts`）→ 维持 service 内 token 校验；**在 `createShare`/`createProvincialShare` 生成处补 `expiresAt = now+30d`**（§2.3）。
- **物理隔绝铁律**：所有写操作只用 `share`/`intake` 上下文的 `role`/`routeId`/`costInquiryId`，绝不读 JWT 的 `agencyId`（除 pandaking 控制台操作）。省地接社 A 的 token 只能加载其自身 `costInquiryId` 数据，读不到 B。

#### 3.3.4 令牌生成统一
- 新建令牌（`genToken`/`intake-link`/share）统一用 `crypto.randomBytes(16).toString('hex')`（优于现有 `Math.random` 拼接，防可预测）；封装到 `auth.service.genToken` 或 `routes.service` 内公共函数。

### 3.4 错误码表
| 错误码 | HTTP | 含义 |
|---|---|---|
| `AUTH_INVALID_CREDENTIALS` | 401 | 手机号/密码错误，或账号不存在/禁用/非管理员（统一提示） |
| `AUTH_LOCKED` | 429 | 登录失败过多，临时锁定（含 Retry-After） |
| `AUTH_REQUIRE_CHANGE_PWD` | 200(flag) | 登录成功但需强制改密 |
| `ADMIN_PHONE_EXISTS` | 409 | 手机号已被占用 |
| `ADMIN_LAST_ONE` | 400 | 禁止禁用/删除最后一个可用管理员 |
| `SHARE_INVALID` | 401 | 协作/提交令牌无效 |
| `SHARE_EXPIRED` | 401 | 令牌已过期 |
| `INTAKE_INVALID` / `INTAKE_EXPIRED` | 401 | 提交链接无效/过期 |
| `VALIDATION` | 400 | 字段校验失败（手机号格式/密码强度/必填） |

---

## 4. 接口契约精确表

| 方法 | 路径 | 鉴权 | 请求 | 响应 |
|---|---|---|---|---|
| POST | `/api/auth/login` | 无 | `{phone,password}` | `{token,user,requireChangePwd?}` |
| POST | `/api/auth/change-pwd` | JWT | `{oldPwd,newPwd}` | `{ok:true,user}` |
| GET | `/api/auth/me` | JWT | — | `AuthUserView` |
| GET | `/api/auth/admins` | JWT(pk) | — | `AdminView[]`（phone masked） |
| POST | `/api/auth/admins` | JWT(pk) | `{name,phone,initPwd}` | `AdminView` |
| POST | `/api/auth/admins/:id/reset-pwd` | JWT(pk) | `{initPwd}` | `{ok:true}` |
| POST | `/api/auth/admins/:id/disable` | JWT(pk) | — | `AdminView` |
| POST | `/api/routes/intake-link` | JWT(pk) | `{agencyId}` | `{token,link}` |
| POST | `/api/routes/intake` | ShareToken(intake) | `{token,draft}` | `{routeId}` |
| GET | `/h5/route/:token` 等写操作 | ShareToken(share, service 内) | 现有 | 现有 |
| GET | `/h5/intake/:token` | ShareToken(intake, service 内) | — | 机构提交 H5 页 |

> `AdminView` = `{ id, name, phone(masked), disabled, mustChangePwd, createdAt }`（**不含 password**）。
> `AuthUserView` = `{ id, name, role, agencyId, level, phone(masked), email, disabled }`。

---

## 5. 前端改造规则

### 5.1 新增页面与路由
- `/login`：手机号 + 密码表单 → 调 `login` → 存 `localStorage['token']`+`['user']` → 若 `requireChangePwd` 跳 `/change-pwd`，否则跳控制台。
- `/change-pwd`：**强制、不可跳过**；校验 `oldPwd`+`newPwd`(≥8)；成功后回控制台。路由守卫：若 `user.mustChangePwd` 且访问非本页 → 重定向至此。
- `/admin/admins`（控制台内）：管理员列表（名称+手机号打码+状态）+ 新增（名称+手机号+初始密码）+ 重置密码 + 禁用（禁用手前校验仍有≥1 可用，前端可先乐观校验）。
- `/h5/intake/:token`：**免登录**起草表单（客户/目的地/行程/初步报价）→ 调 `POST /routes/intake`。

### 5.2 路由守卫
- 控制台类路由（`/route*`,`/admin/*`,`/account` 等）：未持有效 `localStorage['token']` → 跳 `/login`。
- H5 公开类路由（`/h5/route/:token`,`/h5/intake/:token`,`/h5/cost-inquiry/:token`,`/share/*`,案例页）：**无守卫**，靠 token 参数自身鉴权。
- 退出登录：清 `localStorage['token']`+`['user']` → 跳 `/login`。

### 5.3 既有协作 H5 改造
- `api/h5.ts` 已将 token 拼进 URL 路径（`/h5/route/${token}/...`），`client.ts` 自动带 Bearer → **无需改调用方式**；H5 端点忽略 JWT（现状），链接即凭证已成立。
- 控制台新增入口：`RouteDetail.vue`/机构目录页加「生成机构提交链接」「协作链接重发（重发=新建 share 并设 +30d）」。

### 5.4 保留 `dev-login`
- 开发态保留角色切换入口，生产禁用（后端已控）。

---

## 6. 安全与合规规则（精确）

- **密码**：bcrypt cost 12；传输 HTTPS（生产云托管已全站）；登录失败限流 5/10min。
- **手机号**：仅作登录标识，**绝不发送短信验证码**；列表展示脱敏 `138****0000`；落库完整。
- **JWT**：30d 存 `localStorage`（MVP 接受 XSS 风险，httpOnly cookie 列 Phase 2）；`JWT_SECRET` 生产必须配 env（现有 `'dev-only-change-me'` 仅 fallback，禁止生产使用）。
- **日志**：不记 password 明文、不记完整 JWT；异常不含敏感。
- **个人信息最小化**：协作者不采集手机号/姓名（`authorName` 可选自填）；`openid` 保持 nullable 待 Phase 2。
- **公开边界**：对客 H5 不含成本①/利润（沿用 `role-visibility` 的 public 视图）。
- **防越权**：协作 H5 的 token 归属校验服务端强制执行（§3.3.3 铁律）。

---

## 7. 迁移与部署

1. **迁移（禁 migrate dev）**：
   - 生成 diff：`prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel ./prisma/schema.prisma --script` → 手写 `prisma/migrations/<ts>_auth_link_v1/migration.sql`（按 §2.1/§2.2 SQL）。
   - **剔除** `tencentdb_tbl_dial_test_*` 的 DROP 语句。
   - 应用：backend 本地二进制 `./node_modules/.bin/prisma migrate deploy`（禁 pnpm）。
   - 容器 `Dockerfile` CMD 已含幂等 `migrate deploy`，库结构无需手动预迁移。
2. **Seed**：首次部署跑 `tsx prisma/seed.ts`（建 pandaking 主管理员 + 补 password/mustChangePwd）。
3. **后端部署**：`git push origin master` → CloudBase 云托管重建（自动 migrate deploy）。
4. **前端部署**：`bash deploy/deploy.sh`（vite build + 静态上传）。
5. **验证**：强刷；用 seed 手机号+弱密码登录 → 强制改密 → 控制台可用；用无效/过期 token 开 H5 → 401。

---

## 8. 验收标准（DoD，逐条可测）

- [ ] seed 手机号 + 弱密码登录 → 200 且 `requireChangePwd=true`。
- [ ] 改密后再次登录 → `requireChangePwd` 不再返回。
- [ ] 错误密码连续 5 次 → 第 6 次返回 `429 AUTH_LOCKED`。
- [ ] 用未注册手机号登录 → `401`（提示同"凭证错误"，不暴露是否存在）。
- [ ] 无效/过期 share token 打开 H5 → `401 SHARE_INVALID/EXPIRED`。
- [ ] 机构提交链接提交 → 新建 `Route.agencyId == intake.agencyId`、`createdById == 种子 pandaking`、落入 PandaKing 看板且显示归属机构名。
- [ ] 省地接社 A 的 token 调用接口 → 读不到省地接社 B 的 `costInquiry` 数据（物理隔绝）。
- [ ] 禁用最后一个可用管理员 → `400 ADMIN_LAST_ONE`。
- [ ] 新增管理员（名称+手机号+初始密码）→ 该管理员可用同手机号+初始密码登录且被强制改密。
- [ ] 对客 H5（`public=true`）免登录可直接查看，不含成本①/利润。
- [ ] 存量历史 share（`expiresAt IS NULL`）仍可正常打开（兼容不过期）。

---

## 9. 实现任务拆分（供排期）

**后端（约 3–4 人日）**
1. Prisma schema 改 + 手写迁移 SQL + 应用（§2）。
2. `auth.service/controller`：`login`+bcrypt+限流+`change-pwd`；`admins` CRUD（含脱敏/最后一人校验）；`signToken` 30d（§3.1）。
3. `ShareTokenGuard` + `routes.controller` 新增 `intake-link`/`intake`（§3.2/§3.3）。
4. `seed.ts` 改造（§3.1.4）；`createShare`/`createProvincialShare` 补 `expiresAt`（§2.3）；令牌生成统一 crypto（§3.3.4）。

**前端（约 3–4 人日）**
5. `/login` + `/change-pwd` + 路由守卫（§5.1/5.2）。
6. 控制台「管理员管理」页（§5.1）。
7. `/h5/intake/:token` 机构提交 H5（§5.1）。
8. 控制台「生成机构提交链接」「协作链接重发」入口（§5.3）。

**联调上线（约 1–2 人日）**：本地双轨联调 → 安全迁移 + 生产部署 → 强刷验证（§7/§8）。
