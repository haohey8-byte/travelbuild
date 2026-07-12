import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { CaseService } from './case.service'

describe('CaseService', () => {
  it('listPublished 仅返回 published', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'c1', status: 'published' }])
    const svc = new CaseService({ case: { findMany } } as any)
    await svc.listPublished()
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'published' } }),
    )
  })

  it('getPublished 未发布抛 NotFound', async () => {
    const svc = new CaseService({
      case: { findUnique: vi.fn().mockResolvedValue({ id: 'c', status: 'draft' }) },
    } as any)
    await expect(svc.getPublished('c')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('publishFromRoute 仅搬运脱敏字段并落成草稿', async () => {
    const route = {
      destination: '成都·九寨',
      versions: [
        {
          itinerary: { days: [1, 2, 3] },
          quote: { currency: 'CNY', total: 28000 },
        },
      ],
    }
    const create = vi.fn().mockResolvedValue({ id: 'c2' })
    const svc = new CaseService({
      route: { findUnique: vi.fn().mockResolvedValue(route) },
      case: { create },
    } as any)
    await svc.publishFromRoute('r1', 'u1')
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          routeId: 'r1',
          destination: '成都·九寨',
          days: 3,
          priceRange: 'CNY 28000',
          status: 'draft',
          createdById: 'u1',
        }),
      }),
    )
  })

  it('publish 设置 publishedAt', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'c3', status: 'published' })
    const svc = new CaseService({
      case: { findUnique: vi.fn().mockResolvedValue({ id: 'c3' }), update },
    } as any)
    await svc.publish('c3')
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'published', publishedAt: expect.any(Date) } }),
    )
  })
})
