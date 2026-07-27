import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// —— Essential 种子：仅保证「首次部署后能登录管理后台」————————————
// 这是容器启动默认跑的最小集（Dockerfile CMD 调用）。
//
// 历史背景：原 seed.ts 把演示数据（5 个机构 / 路线 / 案例 / KB / 邀请）
// 与 essential 数据混在同一个文件且 hardcode 了固定 ID，导致：
//   - 用户从 UI 删了演示数据
//   - 容器下次重启自动跑 seed
//   - 演示数据又被 create 回来（"删了又出现"）
//
// 当前改造（2026-07-27）：演示数据迁到 prisma/seed-demo.ts，受 SEED_DEMO=1 门控；
// 本文件仅保留管理员账号 seed-pk。其他演示数据请通过：
//   pnpm --filter backend seed:demo   # 本地手动跑
// 或在云托管临时设 SEED_DEMO=1 重新部署一次（演示数据回来后再改回 0）。
// -----------------------------------------------------------------------------

const SEED_ADMIN_PHONE = process.env.SEED_ADMIN_PHONE || '13800000000'
const SEED_ADMIN_PWD = process.env.SEED_ADMIN_PWD || 'Pandaking@2026'

async function ensureUser(id: string, data: Record<string, unknown>) {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (existing) return existing
  return prisma.user.create({ data: { id, ...data } })
}

async function main() {
  // 唯一管理员账号 seed-pk —— 仅首次创建；已改密的不覆盖（迁移兜底见下）
  const pandaking = await ensureUser('seed-pk', {
    name: 'PandaKing 一手',
    role: 'pandaking',
    level: 'admin',
    phone: SEED_ADMIN_PHONE,
    password: await bcrypt.hash(SEED_ADMIN_PWD, 12),
    mustChangePwd: true,
  })
  // 迁移场景兜底：旧种子用户缺密码时补种（不影响已设置密码的账号）
  if (!pandaking.password) {
    await prisma.user.update({
      where: { id: 'seed-pk' },
      data: {
        phone: SEED_ADMIN_PHONE,
        password: await bcrypt.hash(SEED_ADMIN_PWD, 12),
        mustChangePwd: true,
      },
    })
  }

  // eslint-disable-next-line no-console
  console.log('[seed-essential] done:', { pandaking: pandaking.id })
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
