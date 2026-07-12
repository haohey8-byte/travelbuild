import { describe, expect, it, vi, beforeEach } from 'vitest'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { RoutesService } from './routes.service'
import { hideCostsForRole, maskQuotePublic, Role } from './role-visibility'

function makeService(prisma: any) {
  return new RoutesService(prisma)
}

describe('RoutesService.share / h5 / feedback', () => {
  let prisma: any
  let svc: RoutesService

  beforeEach(() => {
    prisma = {
      routeVersion: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
      },
      routeShare: {
        create: vi.fn(),
        findUnique: vi.fn(),
      },
      route: {
        findUniqueOrThrow: vi.fn(),
      },
      routeFeedback: {
        create: vi.fn(),
      },
    }
    svc = makeService(prisma)
  })

  it('createShare：指向最新非草稿版本并生成链接', async () => {
    prisma.routeVersion.findMany.mockResolvedValue([{ id: 'v2' }])
    prisma.routeShare.create.mockResolvedValue({ token: 'tok123', link: undefined })
    const res = await svc.createShare('r1', 'agency')
    expect(prisma.routeShare.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { token: expect.any(String), routeId: 'r1', versionId: 'v2', role: 'agency' } }),
    )
    expect(res.link).toBe('/h5/route/tok123')
  })

  it('createShare：无对外版本抛 BadRequest', async () => {
    prisma.routeVersion.findMany.mockResolvedValue([])
    await expect(svc.createShare('r1')).rejects.toBeInstanceOf(BadRequestException)
  })

  it('getH5：按 token 解析并仅暴露对客总价', async () => {
    prisma.routeShare.findUnique.mockResolvedValue({ routeId: 'r1', versionId: 'v1', role: 'agency' })
    prisma.route.findUniqueOrThrow.mockResolvedValue({
      id: 'r1',
      destination: '成都',
      groupSize: 2,
      travelDate: new Date('2026-08-01'),
      statusKey: 'confirmed',
    })
    prisma.routeVersion.findUnique.mockResolvedValue({
      id: 'v1',
      version: 'v1',
      itinerary: { day1: '抵达成都' },
      quote: { items: [{ type: 'hotel', cost1: 100, cost2: 50, markup: 30, guestPrice: 180 }], totals: { cost1: 100, cost2: 50, markup: 30, guestPrice: 180 } },
    })
    const h5 = await svc.getH5('tok123')
    expect(h5.destination).toBe('成都')
    expect(h5.guestPrice).toBe(180)
    // 公开视图不应泄露成本拆分
    expect(JSON.stringify(h5)).not.toContain('cost1')
    expect(JSON.stringify(h5)).not.toContain('cost2')
  })

  it('getH5：token 无效抛 NotFound', async () => {
    prisma.routeShare.findUnique.mockResolvedValue(null)
    await expect(svc.getH5('bad')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('submitFeedback：写入反馈并返回脱敏结构', async () => {
    prisma.routeShare.findUnique.mockResolvedValue({ routeId: 'r1', versionId: 'v1' })
    prisma.routeFeedback.create.mockResolvedValue({
      id: 'f1',
      content: '建议加一天九寨',
      authorName: '客户',
      createdAt: new Date('2026-08-02'),
    })
    const fb = await svc.submitFeedback('tok123', '建议加一天九寨', '客户')
    expect(prisma.routeFeedback.create).toHaveBeenCalled()
    expect(fb.content).toBe('建议加一天九寨')
  })

  it('submitFeedback：空内容抛 BadRequest', async () => {
    await expect(svc.submitFeedback('tok123', '   ')).rejects.toBeInstanceOf(BadRequestException)
  })
})

describe('role-visibility 矩阵', () => {
  const quote = {
    items: [{ type: 'hotel', cost1: 100, cost2: 50, markup: 30, guestPrice: 180 }],
    totals: { cost1: 100, cost2: 50, markup: 30, guestPrice: 180 },
  }

  it('pandaking 全见', () => {
    const r = hideCostsForRole(quote, 'pandaking' as Role) as any
    expect(r.totals.cost1).toBe(100)
    expect(r.totals.cost2).toBe(50)
  })

  it('agency 隐藏 cost1/cost2，仅留 guestPrice', () => {
    const r = hideCostsForRole(quote, 'agency' as Role) as any
    expect(r.totals.cost1).toBeUndefined()
    expect(r.totals.cost2).toBeUndefined()
    expect(r.totals.guestPrice).toBe(180)
  })

  it('provincial 隐藏 cost2，保留 cost1', () => {
    const r = hideCostsForRole(quote, 'provincial' as Role) as any
    expect(r.totals.cost1).toBe(100)
    expect(r.totals.cost2).toBeUndefined()
    expect(r.totals.guestPrice).toBe(180)
  })

  it('maskQuotePublic 仅留 guestPrice', () => {
    const r = maskQuotePublic(quote) as any
    expect(r.totals).toEqual({ guestPrice: 180 })
    expect(r.items[0]).toEqual({ type: 'hotel', guestPrice: 180 })
  })
})
