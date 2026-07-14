# 邀请模型 + 机构物理隔绝 改造说明

> 对应需求：PandaKing 作为衔接「境外旅行社 / 省地接社」的枢纽；agency ↔ provincial 在价格与信息上**完全物理隔绝**；邀请为两层级（一手复制 H5 邀请管理员 → 管理员/一手邀请员工）。

## 一、审计结论（原实现与需求不符）
1. **邀请模型是扁平的**：`Invite` 仅 `{email?, role}`，无 `agencyId` / `parentId` / 管理员·员工层级；`acceptInvite` 创建用户时 `agencyId: null`，不绑定任何机构。不满足「两层级邀请 + 机构归属」。
2. **未做物理隔绝**：`routes.service` 的 `findAll/findOne` 全量返回所有路线，agency 与 provincial 互相可见彼此路线；`role-visibility` 把 `markup` 也删了（与权限矩阵注释矛盾）。不满足「agency ↔ provincial 完全物理隔绝」。

## 二、本次改造

### 后端
- **Schema**（`prisma/schema.prisma`）
  - 新增枚举 `RoleLevel { admin, staff }`。
  - `User` 增加 `level` / `parentId`（机构层级与邀请人）；`agencyId` 用于绑定机构。
  - `Invite` 增加 `agencyId` / `level` / `parentId`。
  - `Route` 增加 `agencyId`（归属境外旅行社机构，用于查询隔离）。
- **邀请两层级**（`auth.service.ts` / `auth.controller.ts`）
  - `createInvite`：仅一手可创建「机构管理员」邀请；仅一手或「本机构管理员」可创建「机构员工」邀请（staff 邀请强制继承邀请人机构，物理隔绝）。
  - `acceptInvite`：账号继承邀请的 `agencyId` / `level` / `parentId`。
  - `listMembers`：一手见全部，机构仅见本机构成员。
  - `listInvites`：新增，按机构隔离。
  - JWT 载荷补充 `agencyId` / `level`；`JwtAuthGuard` 注入这两个字段。
- **物理隔绝**（`routes.service.ts`）
  - `findAll/findOne` 按 `agencyId` 过滤：一手见全部；境外旅行社仅见本机构路线；省地接社**无路线视图**。
  - 写操作（`submit/confirm/...`）、版本、反馈均增加 `assertVisible` 机构归属校验。
- **字段可见性**（`role-visibility.ts`）：修正为——旅行社保留自身加价 `markup`、隐藏成本①②；省地接社保留自身成本①、隐藏成本②与加价（与权限矩阵一致）。
- **Seed**：演示账号补齐 `agencyId` / `level`，种子路线绑定 `org-agency-seed`，演示邀请补齐字段（幂等，重跑 seed 也会回写）。

### 前端
- `types`：User 增加 `level`；新增 `Invite` 类型。
- `api/auth`：新增 `createInvite` / `listInvites`；`fetchInvite` 返回结构化 `Invite`。
- `utils/share`：新增 `inviteH5Url(token)`（指向前端 SPA 邀请页）。
- `views/Account.vue`：一手可「邀请机构管理员」（选角色+机构编号）→ 生成 H5 链接复制；管理员可「邀请机构员工」→ 生成链接复制；成员列表按机构隔离展示；新增邀请记录。
- `views/H5Invite.vue`（新）+ 路由 `/h5/invite/:token`：受邀者打开链接 → 填名称 → 接受邀请并进入工作台。

### PRD
- `doc/04-接口契约/账号与认证.md`：两层级邀请模型、agencyId/level、JWT 载荷、成员列表按机构隔离。
- `doc/04-接口契约/权限矩阵.md`：新增「物理隔绝」小节（路线列表 / 成本询价 / 成员列表隔离规则）+ 机构内层级说明。
- `doc/04-接口契约/H5协作链接.md`：新增「邀请接受 H5」链接类型与端点、使用流程。

## 三、关键文件
- `backend/prisma/schema.prisma`、`backend/prisma/seed.ts`
- `backend/prisma/migrations/20260714180000_invite_hierarchy_isolation/migration.sql`
- `backend/src/modules/auth/auth.service.ts`、`auth.controller.ts`
- `backend/src/common/guards/jwt-auth.guard.ts`
- `backend/src/modules/routes/routes.service.ts`、`routes.controller.ts`、`role-visibility.ts`
- `frontend/src/views/Account.vue`、`frontend/src/views/H5Invite.vue`、`frontend/src/router/index.ts`
- `frontend/src/api/auth.ts`、`frontend/src/types/index.ts`、`frontend/src/utils/share.ts`

## 四、部署步骤（需手动执行）
> ⚠️ 本会话**未**对线上数据库执行任何变更。新增代码依赖新字段，必须先迁移再部署。

```bash
# 1) 应用迁移（新增字段/枚举，向后兼容；不要跑 migrate dev，云账号无建库权限）
pnpm migrate:deploy          # = backend prisma migrate deploy

# 2) 重新 seed（补齐机构归属与层级；幂等）
pnpm seed                    # = backend db:seed

# 3) 重新构建前后端
pnpm build

# 4) 部署：前端 deploy:frontend；后端按现有云托管流程重新部署
```

## 五、注意事项
- **迁移方式**：云托管 Postgres 账号无 `CREATE DATABASE` 权限，`prisma migrate dev` 会因无法建 shadow 库失败。已采用 `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel` 生成增量 SQL，并**显式剔除**了云厂商内部探活表 `tencentdb_tbl_dial_test_*`（`DROP TABLE` 已移除），迁移仅做新增，安全可逆（必要时 `ALTER TABLE ... DROP COLUMN`）。
- **验证**：`nest build` 与前端 `vue-tsc + vite build` 均通过；后端 `tsc --noEmit` 通过。

## 六、待办 / 后续
- 成本询价（CostInquiry）接口尚未实现；实现时应沿用 `agencyId` 过滤（他机构成本价隔离），与现有 `Route.agencyId` 隔离思路一致。
- 微信真实换 token / openid 绑定仍为空占位（MVP 回退演示账号），接入后邀请接受的 openid 绑定即可生效。
