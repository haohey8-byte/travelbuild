import { describe, expect, it, vi } from 'vitest'
import { NotFoundException } from '@nestjs/common'
import { KbService } from './knowledge.service'

describe('KbService', () => {
  it('list 按 tag 过滤', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'k1', tags: ['九寨沟'] }])
    const svc = new KbService({ kbEntry: { findMany } } as any)
    await svc.list({ tag: '九寨沟' })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tags: { has: '九寨沟' } } }),
    )
  })

  it('list 关键字检索 title/body', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const svc = new KbService({ kbEntry: { findMany } } as any)
    await svc.list({ q: '门票' })
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ title: { contains: '门票', mode: 'insensitive' } }, { body: { contains: '门票', mode: 'insensitive' } }] },
      }),
    )
  })

  it('getById 不存在抛 NotFound', async () => {
    const svc = new KbService({ kbEntry: { findUnique: vi.fn().mockResolvedValue(null) } } as any)
    await expect(svc.getById('x')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('create 写入默认空 tags', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'k2' })
    const svc = new KbService({ kbEntry: { create } } as any)
    await svc.create({ title: 'T', category: 'C', body: 'B', createdById: 'u' })
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tags: [] }) }),
    )
  })
})
