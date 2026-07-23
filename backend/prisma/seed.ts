import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// 种子管理员登录凭据（覆盖：环境变量 > 默认值）。固定弱密码 + 首次强制改密兜底。
const SEED_ADMIN_PHONE = process.env.SEED_ADMIN_PHONE || '13800000000'
const SEED_ADMIN_PWD = process.env.SEED_ADMIN_PWD || 'Pandaking@2026'
// 种子协作者手机号（必须 unique 且非空，故为每条预置独立号码；与 seed-pk 不冲突）
const SEED_AGENCY_PHONE = process.env.SEED_AGENCY_PHONE || '13800000001'
const SEED_PROVINCIAL_PHONE = process.env.SEED_PROVINCIAL_PHONE || '13800000002'
// 种子协作者初始密码（D1：协作方也有控制台账号，需可登录）
const SEED_AGENCY_PWD = process.env.SEED_AGENCY_PWD || 'Agency@2026'
const SEED_PROVINCIAL_PWD = process.env.SEED_PROVINCIAL_PWD || 'Provincial@2026'

// 幂等种子：以固定 id upsert，重复执行安全
async function main() {
  // 1) 机构（境外旅行社 / 省地接社）
  const agencyOrg = await prisma.agency.upsert({
    where: { id: 'org-agency-seed' },
    update: { name: '环球旅行社', role: 'agency' },
    create: { id: 'org-agency-seed', name: '环球旅行社', role: 'agency' },
  })
  const provincialOrg = await prisma.agency.upsert({
    where: { id: 'org-provincial-seed' },
    update: { name: '川内地接社', role: 'provincial' },
    create: { id: 'org-provincial-seed', name: '川内地接社', role: 'provincial' },
  })

  // 真实机构（用户后续将邀请对应的微信账号归属到此）
  await prisma.agency.upsert({
    where: { id: 'agency-101ways-to-china' },
    update: { name: '101 ways to china', role: 'agency' },
    create: { id: 'agency-101ways-to-china', name: '101 ways to china', role: 'agency' },
  })
  await prisma.agency.upsert({
    where: { id: 'provincial-xinjiang-hema' },
    update: { name: '新疆河马旅行社', role: 'provincial' },
    create: { id: 'provincial-xinjiang-hema', name: '新疆河马旅行社', role: 'provincial' },
  })
  await prisma.agency.upsert({
    where: { id: 'provincial-chongqing-yuqing' },
    update: { name: '重庆渝青旅游', role: 'provincial' },
    create: { id: 'provincial-chongqing-yuqing', name: '重庆渝青旅游', role: 'provincial' },
  })

  // 角色：一手 PandaKing / 境外旅行社 / 省地接社（含机构归属与层级）
  const pandaking = await prisma.user.upsert({
    where: { id: 'seed-pk' },
    update: { level: 'admin' },
    create: {
      id: 'seed-pk',
      name: 'PandaKing 一手',
      role: 'pandaking',
      level: 'admin',
      phone: SEED_ADMIN_PHONE,
      password: await bcrypt.hash(SEED_ADMIN_PWD, 12),
      mustChangePwd: true,
    },
  })
  // 幂等兜底：若旧种子用户缺少密码（迁移前创建的账号），补种密码 + 强制改密
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
  const agency = await prisma.user.upsert({
    where: { id: 'seed-agency' },
    update: { agencyId: agencyOrg.id, level: 'admin', phone: SEED_AGENCY_PHONE },
    create: {
      id: 'seed-agency',
      name: '环球旅行社',
      role: 'agency',
      agencyId: agencyOrg.id,
      level: 'admin',
      phone: SEED_AGENCY_PHONE,
      password: await bcrypt.hash(SEED_AGENCY_PWD, 12),
      mustChangePwd: true,
    },
  })
  // 幂等兜底：若旧种子用户缺少密码（迁移前创建的账号），补种密码 + 强制改密
  if (!agency.password) {
    await prisma.user.update({
      where: { id: 'seed-agency' },
      data: { password: await bcrypt.hash(SEED_AGENCY_PWD, 12), mustChangePwd: true },
    })
  }
  const provincial = await prisma.user.upsert({
    where: { id: 'seed-provincial' },
    update: { agencyId: provincialOrg.id, level: 'admin', phone: SEED_PROVINCIAL_PHONE },
    create: {
      id: 'seed-provincial',
      name: '川内地接社',
      role: 'provincial',
      agencyId: provincialOrg.id,
      level: 'admin',
      phone: SEED_PROVINCIAL_PHONE,
      password: await bcrypt.hash(SEED_PROVINCIAL_PWD, 12),
      mustChangePwd: true,
    },
  })
  // 幂等兜底：同上
  if (!provincial.password) {
    await prisma.user.update({
      where: { id: 'seed-provincial' },
      data: { password: await bcrypt.hash(SEED_PROVINCIAL_PWD, 12), mustChangePwd: true },
    })
  }

  // 一条演示邀请（机构管理员，7 天有效），用于 accept-invite 联调
  await prisma.invite.upsert({
    where: { id: 'seed-invite-1' },
    update: { agencyId: agencyOrg.id, level: 'admin' },
    create: {
      id: 'seed-invite-1',
      token: 'demo-invite-agency',
      role: 'agency',
      agencyId: agencyOrg.id,
      level: 'admin',
      email: 'agency@example.com',
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      accepted: false,
      createdById: pandaking.id,
    },
  })

  // 一条协作路线 + 两个版本（演示双向回路数据）
  const route = await prisma.route.upsert({
    where: { id: 'seed-route-1' },
    update: { statusKey: 'awaiting_pk_confirm', agencyId: agencyOrg.id, provincialId: provincialOrg.id },
    create: {
      id: 'seed-route-1',
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
    },
  })
  await prisma.routeVersion.upsert({
    where: { id: 'seed-route-1-v1' },
    update: {},
    create: {
      id: 'seed-route-1-v1',
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
    },
  })

  // 一条已发布案例（由已确认路线脱敏派生）
  await prisma.case.upsert({
    where: { id: 'seed-case-1' },
    update: {},
    create: {
      id: 'seed-case-1',
      routeId: route.id,
      destination: '成都·九寨',
      days: 5,
      theme: '亲子自然',
      priceRange: '2.5万-3.5万',
      status: 'published',
      createdById: pandaking.id,
      publishedAt: new Date(),
    },
  })

  // 一条知识库条目
  await prisma.kbEntry.upsert({
    where: { id: 'seed-kb-1' },
    update: {},
    create: {
      id: 'seed-kb-1',
      title: '九寨沟旺季门票与限流规则',
      category: '目的地',
      tags: ['九寨沟', '门票', '限流'],
      body: '九寨沟旺季（4-11月）门票 169 元+观光车 90 元；每日限流 4.1 万人，建议提前 3 天预约。',
      routeId: route.id,
      createdById: pandaking.id,
    },
  })

  // eslint-disable-next-line no-console
  console.log('Seed done:', {
    pandaking: pandaking.id,
    agency: agency.id,
    provincial: provincial.id,
    route: route.id,
  })
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
