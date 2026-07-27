# syntax=docker/dockerfile:1
# 入境游定制协作工作台 —— 后端 NestJS 容器（CloudBase 云托管）
# 构建上下文：仓库根目录；CloudBase 云托管 Dockerfile 路径填：backend/Dockerfile
# 监听端口：3000（容器内由 PORT 环境变量覆盖）；健康检查：/api/health
#
# 重要：基础镜像用 Debian(bookworm-slim) 而非 alpine。
# alpine 的 musl libc + OpenSSL 3 与 Prisma 生成的 musl 引擎不兼容（缺 libssl.so.1.1），
# 会导致容器启动即崩（Back-off restarting failed container）。Debian glibc + OpenSSL 3 原生兼容。

FROM node:22-bookworm-slim AS build
# 显式安装 pnpm v9（与 lockfileVersion 9.0 匹配；corepack 默认可能拉到 v10 导致校验失败）
RUN npm install -g pnpm@9
# 构建阶段也安装 openssl，确保 prisma generate 正确识别 debian-openssl-3.0.x 引擎
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# 复制整个仓库（含 pnpm workspace），安装全部依赖
COPY . .
# 不用 --frozen-lockfile：避免 corepack/pnpm 小版本差异导致 lockfile 严格校验失败
RUN pnpm install
# 生成 Prisma Client（写入 backend/node_modules/.prisma/client；Debian 下生成 linux-openssl 引擎）
RUN pnpm --filter backend exec prisma generate
# 编译 NestJS 到 backend/dist
RUN pnpm --filter backend build
# 编译前端 Vue SPA 到 frontend/dist（与后端同镜像托管，自定义域名直接出网站，无需单独静态托管）
RUN pnpm --filter frontend exec vite build

FROM node:22-bookworm-slim AS prod
ENV NODE_ENV=production
# 生产关闭 dev-login 免密绕过；正式环境禁止以任意角色免密登录
ENV DEV_BYPASS_AUTH=false
# Prisma 引擎依赖 OpenSSL；Debian slim 默认可能缺，显式安装
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# 复制完整依赖（含 .pnpm 软链与 backend/node_modules，保证 prisma 引擎与符号解析正确）
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma
COPY --from=build /app/backend/public ./backend/public
COPY --from=build /app/backend/package.json ./backend/package.json
# 前端构建产物（SPA），运行时由 NestJS 一并托管在根路径
COPY --from=build /app/frontend/dist ./spa
EXPOSE 3000
ENV PORT=3000
# 容器启动：先迁移（幂等），再跑 essential 种子（仅管理员 seed-pk，首次创建 / 改密兜底，不重复演示数据）；
# 演示种子（机构 / 路线 / 案例 / KB / 邀请等）受 SEED_DEMO=1 门控，默认空跑，
# 避免用户从 UI 删除演示数据后被容器自动重建（2026-07-27 改造）。
# 若需演示数据：本机 `pnpm --filter backend seed:demo`，或在云托管临时设 SEED_DEMO=1 重部署一次。
CMD ["sh", "-c", "backend/node_modules/.bin/prisma migrate deploy --schema backend/prisma/schema.prisma && backend/node_modules/.bin/tsx backend/prisma/seed.ts && if [ \"$SEED_DEMO\" = \"1\" ]; then echo '[startup] SEED_DEMO=1 -> running demo seed'; backend/node_modules/.bin/tsx backend/prisma/seed-demo.ts; fi && node backend/dist/main.js"]
