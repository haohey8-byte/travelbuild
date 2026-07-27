import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// —— Demo 演示种子：仅在 SEED_DEMO=1 时执行 ——————————————————————
//
// 默认情况下生产容器不会自动执行此文件 —— 用户从 UI 删除演示数据后，
// 重启容器不会被重建。本文件由以下两种方式触发：
//
// 1. 本地 / 调试：  pnpm --filter backend seed:demo
// 2. 云托管演示：   临时把环境变量 SEED_DEMO 设为 1，重新部署一次，
//                   部署完改回 0（下次不再自动执行）。
//
// 故意使用 fixed-id 是为了多轮协作 seed 可重现（不同启动能比对同一条
// 路线/案例/KB）。fix-id 用 ensure()「存在则跳过」避免覆盖用户真实数据。
// -----------------------------------------------------------------------------

const SEED_AGENCY_PHONE = process.env.SEED_AGENCY_PHONE || '13800000001'
const SEED_PROVINCIAL_PHONE = process.env.SEED_PROVINCIAL_PHONE || '13800000002'
const SEED_AGENCY_PWD = process.env.SEED_AGENCY_PWD || 'Agency@2026'
const SEED_PROVINCIAL_PWD = process.env.SEED_PROVINCIAL_PWD || 'Provincial@2026'

async function ensureAgency(
  id: string,
  data: { name: string; role: 'agency' | 'provincial' },
) {
  const existing = await prisma.agency.findUnique({ where: { id } })
  if (existing) return existing
  return prisma.agency.create({ data: { id, ...data } })
}

async function ensureUser(id: string, data: Record<string, unknown>) {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (existing) return existing
  return prisma.user.create({ data: { id, ...data } })
}

async function ensureInvite(id: string, data: Record<string, unknown>) {
  const existing = await prisma.invite.findUnique({ where: { id } })
  if (existing) return existing
  return prisma.invite.create({ data: { id, ...data } })
}

async function ensureRoute(id: string, data: Record<string, unknown>) {
  const existing = await prisma.route.findUnique({ where: { id } })
  if (existing) return existing
  return prisma.route.create({ data: { id, ...data } })
}

async function ensureRouteVersion(id: string, data: Record<string, unknown>) {
  const existing = await prisma.routeVersion.findUnique({ where: { id } })
  if (existing) return existing
  return prisma.routeVersion.create({ data: { id, ...data } })
}

async function ensureCase(id: string, data: Record<string, unknown>) {
  const existing = await prisma.case.findUnique({ where: { id } })
  if (existing) return existing
  return prisma.case.create({ data: { id, ...data } })
}

async function ensureKbEntry(id: string, data: Record<string, unknown>) {
  const existing = await prisma.kbEntry.findUnique({ where: { id } })
  if (existing) return existing
  return prisma.kbEntry.create({ data: { id, ...data } })
}

async function main() {
  // 1) 演示机构 —— 仅首次创建
  const agencyOrg = await ensureAgency('org-agency-seed', { name: '环球旅行社', role: 'agency' })
  const provincialOrg = await ensureAgency('org-provincial-seed', { name: '川内地接社', role: 'provincial' })
  await ensureAgency('agency-101ways-to-china', { name: '101 ways to china', role: 'agency' })
  await ensureAgency('provincial-xinjiang-hema', { name: '新疆河马旅行社', role: 'provincial' })
  await ensureAgency('provincial-chongqing-yuqing', { name: '重庆渝青旅游', role: 'provincial' })

  // 2) 演示角色用户 —— 仅首次创建
  const agency = await ensureUser('seed-agency', {
    name: '环球旅行社',
    role: 'agency',
    agencyId: agencyOrg.id,
    level: 'admin',
    phone: SEED_AGENCY_PHONE,
    password: await bcrypt.hash(SEED_AGENCY_PWD, 12),
    mustChangePwd: true,
  })
  const provincial = await ensureUser('seed-provincial', {
    name: '川内地接社',
    role: 'provincial',
    agencyId: provincialOrg.id,
    level: 'admin',
    phone: SEED_PROVINCIAL_PHONE,
    password: await bcrypt.hash(SEED_PROVINCIAL_PWD, 12),
    mustChangePwd: true,
  })

  // 一条演示邀请（机构管理员，7 天有效），用于 accept-invite 联调 —— 仅首次创建
  await ensureInvite('seed-invite-1', {
    token: 'demo-invite-agency',
    role: 'agency',
    agencyId: agencyOrg.id,
    level: 'admin',
    email: 'agency@example.com',
    expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    accepted: false,
    createdById: 'seed-pk',
  })

  // 一条协作路线 + 两个版本（演示双向回路数据）—— 仅首次创建
  const route = await ensureRoute('seed-route-1', {
    customerName: 'Smith Family',
    customerNameCn: '史密斯一家',
    country: 'US',
    agency: '环球旅行社',
    destination: '成都·九寨',
    groupSize: 4,
    travelDate: new Date('2026-10-01'),
    statusKey: 'awaiting_pk_confirm',
    modeKey: 'collab',
    agencyId: agencyOrg.id,
    provincialId: provincialOrg.id,
    createdById: agency.id,
  })
  await ensureRouteVersion('seed-route-1-v1', {
    routeId: route.id,
    version: 'v1',
    draft: true,
    itinerary: {
      days: [
        { day: 1, city: '成都', spots: ['宽窄巷子', '锦里'], hotel: '成都香格里拉', meal: '火锅' },
        { day: 2, city: '九寨沟', spots: ['五花海', '诺日朗瀑布'], hotel: '九寨沟悦榕庄', meal: '藏餐' },
      ],
    },
    quote: { currency: 'CNY', total: 28000, items: [{ name: '酒店', amount: 12000 }] },
  })

  // 一条已发布案例（由已确认路线脱敏派生）—— 仅首次创建
  await ensureCase('seed-case-1', {
    routeId: route.id,
    destination: '成都·九寨',
    days: 5,
    theme: '亲子自然',
    priceRange: '2.5万-3.5万',
    status: 'published',
    createdById: 'seed-pk',
    publishedAt: new Date(),
  })

  // 一条知识库条目 —— 仅首次创建
  await ensureKbEntry('seed-kb-1', {
    title: '九寨沟旺季门票与限流规则',
    category: '目的地',
    tags: ['九寨沟', '门票', '限流'],
    body: '九寨沟旺季（4-11月）门票 169 元+观光车 90 元；每日限流 4.1 万人，建议提前 3 天预约。',
    routeId: route.id,
    createdById: 'seed-pk',
  })

  // eslint-disable-next-line no-console
  console.log('[seed-demo] done:', { route: route.id, agency: agency.id, provincial: provincial.id })
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
