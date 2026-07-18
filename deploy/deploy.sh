#!/usr/bin/env bash
# PandaKing9 前端一键部署脚本
# 用法： bash deploy/deploy.sh
# 前置： deploy/.env.local 已存在（含 COS_SECRET_ID / COS_SECRET_KEY 等，gitignored）
#
# 脚本会自动：
#   1) source deploy/.env.local（加载密钥与代理）
#   2) git push origin master
#   3) 前端 npm install && npm run build
#   4) node deploy/deploy-frontend.mjs（部署到 CloudBase 静态网站托管）
# 后端部署请到 CloudBase 控制台点【重新部署】（容器启动自动 prisma migrate deploy）。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1) 加载本地密钥（gitignored，不入库）
if [ ! -f "$SCRIPT_DIR/.env.local" ]; then
  echo "❌ 缺少 $SCRIPT_DIR/.env.local —— 请先复制模板并填入密钥："
  echo "   cp deploy/env-local.example deploy/.env.local"
  echo "   然后编辑 .env.local 填入你的腾讯云 SecretId / SecretKey"
  exit 1
fi
set -a
source "$SCRIPT_DIR/.env.local"
set +a

# 2) 切到项目根目录（deploy 的父目录）
cd "$SCRIPT_DIR/.."
ROOT="$(pwd)"

echo "==> [1/3] 推送代码到 origin/master"
git push origin master

echo "==> [2/3] 构建前端"
cd "$ROOT/frontend"
npm install
npm run build
cd "$ROOT"

echo "==> [3/3] 部署前端到 CloudBase 静态网站托管"
node deploy/deploy-frontend.mjs

echo ""
echo "✅ 前端部署完成。"
echo "⚠️ 后端请到 CloudBase 控制台 → 云托管 → 后端服务 → 点【重新部署】"
echo "   （容器启动会自动 prisma migrate deploy，幂等，已应用的迁移不会重跑）"
