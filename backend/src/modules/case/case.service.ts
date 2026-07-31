import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'

export interface CreateCaseInput {
  routeId?: string
  destination: string
  days: number
  theme: string
  priceRange: string
  createdById: string
  // —— P0 案例公开化扩展字段（均可空，运营后补全） ——
  title?: string | null
  titleEn?: string | null
  titleTh?: string | null
  cover?: string | null
  highlights?: string[]
  descZh?: string | null
  descEn?: string | null
  descTh?: string | null
  daysContent?: Prisma.InputJsonValue
  contentHtml?: string | null // 案例主体 HTML（运营上传的单文件微站，服务端 sanitize 后存）
  // —— 行程参数（公开分享文案用；travelDate/groupSize 由源路线派生可覆盖，vehicle 运营手填）——
  travelDate?: Date | string | null
  groupSize?: number | null
  vehicle?: string | null
}

// 联合品牌档案（via=agencyId 时随案例详情返回）
export interface AgencyBranding {
  id: string
  name: string
  logoUrl: string | null
  contacts: unknown
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

  async getPublished(id: string, via?: string) {
    const c = await this.prisma.case.findUnique({ where: { id } })
    if (!c || c.status !== 'published') throw new NotFoundException('案例不存在或未发布')
    // 联合品牌：via 为有效且未禁用的机构 id 时内嵌其品牌档案；无效 via 静默忽略
    let agencyBranding: AgencyBranding | null = null
    if (via) {
      const agency = await this.prisma.agency.findUnique({ where: { id: via } })
      if (agency && !agency.disabled) {
        agencyBranding = {
          id: agency.id,
          name: agency.name,
          logoUrl: agency.logoUrl,
          contacts: agency.contacts,
        }
      }
    }
    return { ...c, agencyBranding }
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
    const itinerary = latest?.itinerary as { days?: any[] } | null
    const rawDays = Array.isArray(itinerary?.days) ? itinerary!.days! : []
    const days = rawDays.length
    const quote = latest?.quote as { currency?: string; total?: number } | null
    const priceRange =
      quote?.currency && quote?.total ? `${quote.currency} ${quote.total}` : ''
    // 脱敏每日图文（仅城市/景点/酒店/餐饮/备注，绝不含客户名/证件/合同价），运营后可覆盖
    const daysContent = rawDays.map((d, i) => ({
      day: typeof d?.day === 'number' ? d.day : i + 1,
      city: d?.city ?? '',
      spots: Array.isArray(d?.spots) ? d.spots : [],
      hotel: d?.hotel ?? '',
      meals: Array.isArray(d?.meals) ? d.meals : [],
      notes: d?.notes ?? '',
      image: null,
    }))
    return this.prisma.case.create({
      data: {
        routeId,
        destination: route.destination,
        days,
        theme: '',
        priceRange,
        title: '', // 默认空，运营在管理后台补全标题
        // 行程参数：出行时间 / 人数由源路线带值（脱敏后仅展示，不含客户隐私），运营可在后台覆盖；
        // vehicle（几座车）源路线无此字段，保持 NULL 由运营手填。
        travelDate: route.travelDate ?? null,
        groupSize: route.groupSize ?? null,
        daysContent,
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
