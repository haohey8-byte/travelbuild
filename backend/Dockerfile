# syntax=docker/dockerfile:1
# 入境游定制协作工作台 —— 后端 NestJS 容器（CloudBase 云托管）
# 构建上下文：仓库根目录；CloudBase 云托管 Dockerfile 路径填：backend/Dockerfile
# 监听端口：3000（容器内由 PORT 环境变量覆盖）；健康检查：/api/health

FROM node:22-alpine AS build
# 显式安装 pnpm v9（与 lockfileVersion 9.0 匹配；corepack 默认可能拉到 v10 导致 frozen 校验失败）
RUN npm install -g pnpm@9
WORKDIR /app
# 复制整个仓库（含 pnpm workspace），安装全部依赖
COPY . .
# 不用 --frozen-lockfile：避免 corepack/pnpm 小版本差异导致 lockfile 严格校验失败
RUN pnpm install
# 生成 Prisma Client（写入 backend/node_modules/.prisma/client）
RUN pnpm --filter backend exec prisma generate
# 编译 NestJS 到 backend/dist
RUN pnpm --filter backend build

FROM node:22-alpine AS prod
ENV NODE_ENV=production
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
