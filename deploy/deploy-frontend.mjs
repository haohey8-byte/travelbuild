// 前端静态资源部署到腾讯云 CloudBase 静态网站托管
//
// 用法：
//   1) 安装并构建前端：
//        cd /d/workbuddy-project/frontend
//        npm install
//        npm run build
//   2) 配置环境变量：export COS_SECRET_ID="..." && export COS_SECRET_KEY="..."
//   3) 执行部署： node deploy/deploy-frontend.mjs
//
// 说明：
//   - 本脚本使用 CloudBase CLI (tcb) 上传到静态网站托管；
//   - EdgeOne 的加速域名、SPA 回源重写（/* -> /index.html）、/api 反代到 CloudBase 后端
//     等规则请在 EdgeOne 控制台配置，详见 doc/06-上线部署.md。
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const DIST = join(process.cwd(), 'frontend', 'dist')
if (!existsSync(DIST)) {
  console.error('[deploy] frontend/dist 不存在，请先执行：cd frontend && npm run build')
  process.exit(1)
}

const { COS_SECRET_ID, COS_SECRET_KEY } = process.env
if (!COS_SECRET_ID || !COS_SECRET_KEY) {
  console.error('[deploy] 缺少环境变量：COS_SECRET_ID / COS_SECRET_KEY')
  process.exit(1)
}

const ENV_ID = process.env.TCB_ENV_ID || 'travelbuild-d3gvgvtj70ddd0e43'

console.log(`[deploy] 使用 CloudBase CLI 部署到环境 ${ENV_ID}`)
console.log(`[deploy] 本地目录：${DIST}`)

function run(cmd, args) {
  console.log(`[deploy] $ ${cmd} ${args.join(' ')}`)
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    console.error(`[deploy] 命令失败，退出码 ${result.status}`)
    process.exit(result.status || 1)
  }
}

// 登录（非交互式，使用云 API 密钥）
run('npx', ['tcb', 'login', '--apiKeyId', COS_SECRET_ID, '--apiKey', COS_SECRET_KEY])

// 部署到静态网站托管根目录
run('npx', ['tcb', 'hosting', 'deploy', DIST.replace(/\\/g, '/'), '/', '-e', ENV_ID])

console.log('[deploy] 部署完成。请在 EdgeOne 控制台确认加速域名与 SPA 回源重写。')
