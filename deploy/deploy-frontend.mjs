// 前端静态资源部署到腾讯云 COS（作为 EdgeOne 加速源站）
//
// 用法：
//   1) 安装依赖：  pnpm add -w cos-nodejs-sdk-v5
//   2) 配置环境变量（建议放在 CI 密钥或本地 shell，不要入库）：
//        COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION
//   3) 先构建：    pnpm -F frontend build
//   4) 执行部署：  node deploy/deploy-frontend.mjs
//
// 说明：
//   - 本脚本仅负责把 frontend/dist 上传到 COS，并设好缓存策略；
//   - EdgeOne 的加速域名、SPA 回源重写（/* -> /index.html）、/api 反代到 CloudBase 后端
//     等规则请在 EdgeOne 控制台配置，详见 doc/06-上线部署.md。
import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = join(process.cwd(), 'frontend', 'dist')
if (!existsSync(DIST)) {
  console.error('[deploy] frontend/dist 不存在，请先执行：pnpm -F frontend build')
  process.exit(1)
}

const { COS_SECRET_ID, COS_SECRET_KEY, COS_BUCKET, COS_REGION } = process.env
if (!COS_SECRET_ID || !COS_SECRET_KEY || !COS_BUCKET || !COS_REGION) {
  console.error(
    '[deploy] 缺少环境变量：COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION',
  )
  process.exit(1)
}

const CosSDK = await import('cos-nodejs-sdk-v5').catch((e) => {
  console.error('[deploy] 请先安装依赖：pnpm add -w cos-nodejs-sdk-v5')
  throw e
})
const COS = new CosSDK({ SecretId: COS_SECRET_ID, SecretKey: COS_SECRET_KEY })

// index.html 不缓存（每次发布立即可见）；静态资源长缓存（带 hash 文件名，安全）
const cacheControl = (file) =>
  file === 'index.html' ? 'no-cache' : 'max-age=31536000, immutable'

function walk(dir, base = '') {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const rel = base ? `${base}/${name}` : name
    if (statSync(full).isDirectory()) out.push(...walk(full, rel))
    else out.push(rel)
  }
  return out
}

const files = walk(DIST)
console.log(`[deploy] 上传 ${files.length} 个文件到 cos://${COS_BUCKET}/`)

await Promise.all(
  files.map(
    (rel) =>
      new Promise((resolve, reject) => {
        COS.putObject(
          {
            Bucket: COS_BUCKET,
            Region: COS_REGION,
            Key: rel,
            Body: readFileSync(join(DIST, rel)),
            CacheControl: cacheControl(rel),
          },
          (err) => (err ? reject(err) : resolve()),
        )
      }),
  ),
)

console.log('[deploy] 上传完成。请在 EdgeOne 控制台配置加速域名与 SPA 回源重写。')
