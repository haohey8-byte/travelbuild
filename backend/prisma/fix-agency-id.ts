import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 修复：把 agency 角色创建但 agencyId 为 null 的历史路线补回 agencyId，
// 否则 agency 视角的看板 / 隔离校验会把它们当成不可见。
// 按 createdById 映射机构：seed-agency → org-agency-seed
const CREATOR_TO_AGENCY: Record<string, string> = {
  'seed-agency': 'org-agency-seed',
  'seed-pk': 'org-agency-seed', // 一手代发的也归属演示机构
}

async function main() {
  const routes = await prisma.route.findMany({
    where: { agencyId: null },
    select: { id: true, createdById: true },
  })
  console.log(`找到 agencyId 为空的路线 ${routes.length} 条`)
  let fixed = 0
  for (const r of routes) {
    const target = CREATOR_TO_AGENCY[r.createdById]
    if (!target) continue
    await prisma.route.update({ where: { id: r.id }, data: { agencyId: target } })
    fixed++
  }
  console.log(`已修复 ${fixed} 条`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
