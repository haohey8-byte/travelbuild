import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export interface CreateCaseInput {
  routeId?: string
  destination: string
  days: number
  theme: string
  priceRange: string
  createdById: string
}

@Injectable()
export class CaseService {
  constructor(private readonly prisma: PrismaService) {}

  // 公开列表：仅已发布（案例展示页）
  listPublished() {
    return this.prisma.case.findMany({
      where: { status: 'published' },
      orderBy: { publishedAt: 'desc' },
    })
  }

  // 全量（需登录，含草稿/下线，供管理后台）
  listAll() {
    return this.prisma.case.findMany({ orderBy: { createdAt: 'desc' } })
  }

  async getPublished(id: string) {
    const c = await this.prisma.case.findUnique({ where: { id } })
    if (!c || c.status !== 'published') throw new NotFoundException('案例不存在或未发布')
    return c
  }

  async getById(id: string) {
    const c = await this.prisma.case.findUnique({ where: { id } })
    if (!c) throw new NotFoundException('案例不存在')
    return c
  }

  create(input: CreateCaseInput) {
    return this.prisma.case.create({ data: { ...input, status: 'draft' } })
  }

  // 由已确认路线派生脱敏案例（草稿态）：仅搬运安全字段，不含客户真名/证件/合同价
  async publishFromRoute(routeId: string, createdById: string) {
    const route = await this.prisma.route.findUnique({
      where: { id: routeId },
      include: { versions: { orderBy: { createdAt: 'desc' }, take: 1 } },
    })
    if (!route) throw new NotFoundException('路线不存在')
    const latest = route.versions[0]
    const itinerary = latest?.itinerary as { days?: unknown[] } | null
    const days = Array.isArray(itinerary?.days) ? itinerary!.days!.length : 0
    const quote = latest?.quote as { currency?: string; total?: number } | null
    const priceRange =
      quote?.currency && quote?.total ? `${quote.currency} ${quote.total}` : ''
    return this.prisma.case.create({
      data: {
        routeId,
        destination: route.destination,
        days,
        theme: '',
        priceRange,
        status: 'draft',
        createdById,
      },
    })
  }

  async publish(id: string) {
    await this.getById(id)
    return this.prisma.case.update({
      where: { id },
      data: { status: 'published', publishedAt: new Date() },
    })
  }

  async unpublish(id: string) {
    await this.getById(id)
    return this.prisma.case.update({ where: { id }, data: { status: 'offline', publishedAt: null } })
  }

  async update(id: string, input: Partial<Omit<CreateCaseInput, 'createdById'>>) {
    await this.getById(id)
    return this.prisma.case.update({ where: { id }, data: input })
  }

  remove(id: string) {
    return this.prisma.case.delete({ where: { id } })
  }
}
