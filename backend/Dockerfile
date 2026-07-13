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

FROM node:22-bookworm-slim AS prod
ENV NODE_ENV=production
# 演示阶段开放 dev-login；正式上线前应移除或改为 false
ENV DEV_BYPASS_AUTH=true
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
COPY --from=build /app/backend/package.json ./backend/package.json
EXPOSE 3000
ENV PORT=3000
CMD ["node", "backend/dist/main.js"]
