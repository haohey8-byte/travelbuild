# PandaKing9 Travel — 换机 / 换 WorkBuddy 账号 续研指南

> 适用场景：在另一台电脑、用另一个 WorkBuddy 账号，继续开发本旅行定制协作平台。
> 本文是项目约定的"单一事实来源（single source of truth）"，随仓库走；本会话的 `.workbuddy/memory/` 仅作补充，未入库。

---

## 0. 一句话总结
代码与全部文档已在 GitHub，新机 `git clone` 即可获得历史与约定；**唯一需手动带的是运行密钥**，以及**让新账号的 AI 先读本文**。

---

## 1. 代码与历史（已在 GitHub，零特殊操作）
- 仓库：`https://github.com/haohey8-byte/travelbuild.git`，分支 `master`
- 新机准备：安装 **Node 22** + **pnpm** + **Git**
- GitHub 推送需代理（本机直连会被 TLS 重置）：
  - Git Bash：`export HTTPS_PROXY="http://127.0.0.1:7897/"`
  - PowerShell：`$env:HTTPS_PROXY="http://127.0.0.1:7897/"`
  - WorkBuddy 沙箱内该代理已注入，可直接 push
- 克隆后：以 `master` 为准，`pnpm install`（仓库为 pnpm workspace，backend/frontend 同仓）
- 若新账号不是该仓库协作者：到 GitHub 把新账号加为 **collaborator**，或使用有写权限的 token
- 提交纪律：**只 `git add` 指定路径，勿 `git add .`**（会话子目录 `2026-07-11-14-44-08/` 禁止入库，部署走仓库根）

---

## 2. 让新账号的 AI "继承记忆"（关键，否则必踩旧坑）
本项目的核心约定已集中在本文件 + `doc/` 下各 spec。新机启动新 WorkBuddy 会话后，**第一句话**发给 AI：

> 请先阅读仓库 `doc/ONBOARDING.md` 以及 `doc/` 下的产品 spec（00-产品概述、01-需求总览、03-角色与数据隔离、05-数据库与部署、06-上线部署 等），按其中约定的部署架构、铁律、三角色数据隔离继续开发 PandaKing9 Travel 平台。不要做局部修补，先全局论证产品逻辑再动手。

如需更完整的历史记忆（可选）：把旧机
- `2026-07-11-14-44-08/.workbuddy/memory/MEMORY.md`（项目长期记忆）
- `C:\Users\<用户>\.workbuddy\MEMORY.md`（跨项目习惯）

复制到新机对应用户目录。但本 ONBOARDING 已覆盖全部要点，一般无需。

---

## 3. 运行环境与密钥（必须手动带，**禁止入库**）
- 本地 `.env`（backend）：`DATABASE_URL` / `JWT_SECRET` / `COS_*` / `STORAGE_DRIVER` 等。
  来源：云托管控制台「服务配置」照抄，或私下传给新机。**绝不提交 git。**
- 云托管环境变量（COS 等 6 个）：必须**同时**在 ①「服务配置」标签页 ②「更新服务 → 部署」弹窗 两处都加，否则容器只读到旧值（表现为"配置丢了"）。正确闭环：服务配置加 6 个并保存 + 部署弹窗内再加 6 个并点部署。
- 数据库：同一云 Postgres，**新机只连不跑 `migrate dev`**；迁移靠容器 `prisma migrate deploy` 自动应用（Dockerfile CMD 已写）。
- COS Bucket 需设「公有读私有写」，否则公开页 `<img>` 403。

---

## 4. 角色与技能（新账号需配置）
- 本项目以 **SeniorDeveloper（高级开发工程师）** 专家身份协作（全栈：Laravel/Livewire/FluxUI、advanced CSS、Three.js、性能优化）。需在新账号配置同名专家 / 粘贴对应 prompt。
- 已用技能在 `~/.workbuddy/skills/`，可整体复制到新机同路径以复用工作流。

---

## 5. 部署纪律（照做不踩坑）
- 后端改动（含新增接口）、无数据库迁移时：push 后去云托管「更新服务 → 更新 Git 平台部署」**重新构建并部署**。
- env 改动：**先配 env 再部署**，且服务配置 + 部署弹窗两处同步。
- 前端用 `createWebHashHistory`；公开页 `/cases`、`/cases/:id` 标记 `public` 放行。
- 改动后必须验证：`tsc --noEmit`（后端）+ `npm run build`（前端），再部署；部署后请用户 **Ctrl+F5** 强刷验证。
- 云托管「重新部署」可能复用旧构建；确认 push 已触发自动构建，或手动「重新构建并部署」。

---

## 6. 产品逻辑与数据隔离（设计前必读，勿局部修补）
- 三角色 **PandaKing / agency / provincial** 物理隔绝，`agencyId` 隔离。
- 协作通知裁剪：agency→PandaKing 只显「对客总价」（报价A+利润②），绝不暴露利润②；省地接看成本①+行程。
- 协调意见透传省地接社：`authorRole='pandaking'` + 前缀 `📨 境外旅行社协调意见`，内容绝不含价；展示层对 `content.startsWith('📨')` 不显身份。
- **防死锁铁律**：任何扩大「X 视为活跃/有效/拦截」判据的改动，必须 `grep` 所有 `if (A) throw/拦截` 护栏，推演新范围下会不会误杀合法操作（曾因"永久链接纳入活跃"+"默认 permanent"导致机构删不掉）。
- 个人开发者无企业资质：微信 OAuth 当前不可行，auth 走「账号密码 + 邀请注册」，微信身份作 Phase 2；涉及微信方案先向用户确认当前资质。

---

## 7. 分享页（已落地，供参考）
- SSR 分享页 `/share/case/:id?via=agencyId`：用**沙箱 iframe（srcdoc）**渲染微站（注入 `REVEAL_FIX` 强制渐显 + `RESIZE_SCRIPT` postMessage 自动高度），修复了"中间内容缺失"。
- 多语言：标题/描述/亮点/每日行程生成 中/英/泰 三套 `data-lang` 文本块；默认语言跟随 `navigator.language`（兜底英文），支持 `?lang=` 覆盖。
- 微站正文：zh 直接内联；en/th 走新增 `GET /share/case/:id/html?lang=en|th` 按需拉取（缺译回落中文）。
- OG meta 保持中文（爬虫不执行 JS）。

---

## 8. 验证部署是否生效（防误判）
- 判据用「特征字串存在性」grep 懒加载子块，**禁用哈希相等 / ownerName / seed**（部署只 `migrate deploy` 不重跑 seed，库值不变）。
- `curl` 经代理正文会被截断：先 `curl -s --compressed URL -o f.js` 落本地再 `grep`，`grep` 前 `wc -c` 核对体积。
- 503 排查：nginx 503 = 网关拿不到上游。①部署窗口（自愈）②冷启动（最小实例数设 ≥1 根除）③启动崩溃（看运行日志）。先 `curl /api/health` 看 200。

---

## 9. 数据库迁移（云 Postgres，无 CREATE DATABASE）
- `migrate dev` 报 P3014 → 禁用。
- 增量 SQL：`migrate diff --from-migrations ./prisma/migrations --to-schema-datamodel ./prisma/schema.prisma --script`（无需活库）→ 手写 migration 目录 + `migration.sql` → 提交；线上自动 `migrate deploy`。
- 严禁用 pnpm 跑 prisma/seed（污染 workspace）；用 backend 本地二进制 `./node_modules/.bin/prisma generate|migrate deploy` 与 `tsx prisma/seed.ts`。
- 迁移命名 `YYYYMMDDHHMMSS_描述`。
