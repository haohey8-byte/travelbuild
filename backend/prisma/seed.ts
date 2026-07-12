import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// 幂等种子：以固定 id upsert，重复执行安全
async function main() {
  // 角色：一手 PandaKing / 境外旅行社
  const pandaking = await prisma.user.upsert({
    where: { id: 'seed-pk' },
    update: {},
    create: { id: 'seed-pk', name: 'PandaKing 一手', role: 'pandaking' },
  })
  const agency = await prisma.user.upsert({
    where: { id: 'seed-agency' },
    update: {},
    create: { id: 'seed-agency', name: '环球旅行社', role: 'agency' },
  })

  // 一条协作路线 + 两个版本（演示双向回路数据）
  const route = await prisma.route.upsert({
    where: { id: 'seed-route-1' },
    update: { statusKey: 'awaiting_pk_confirm' },
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
  console.log('Seed done:', { pandaking: pandaking.id, agency: agency.id, route: route.id })
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
