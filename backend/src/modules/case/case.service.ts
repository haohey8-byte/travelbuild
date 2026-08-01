import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { UploadService } from '../upload/upload.service'
import { TranslateService } from '../translate/translate.service'

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

// 从 HTML 提取案例标题：优先 h1 文本，其次 <title>；剥标签、压缩空白、截 80 字
function extractHtmlTitle(html: string): string {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  const tag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const raw = (h1?.[1] || tag?.[1] || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
  return raw.slice(0, 80)
}

@Injectable()
export class CaseService {
  private readonly logger = new Logger(CaseService.name)
  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadSvc: UploadService,
    private readonly translate: TranslateService,
  ) {}

  // 管理权限：pandaking 全量；agency 仅能管理归属自己机构的案例（agencyId 匹配）
  private async assertCanManage(id: string, user: { role?: string; agencyId?: string | null }) {
    if (user.role === 'pandaking') return
    const c = await this.prisma.case.findUnique({ where: { id } })
    if (!c) throw new NotFoundException('案例不存在')
    if (user.agencyId && c.agencyId && c.agencyId === user.agencyId) return
    throw new ForbiddenException('无权操作该案例')
  }

  // 公开列表：仅已发布（案例展示页）
  listPublished() {
    return this.prisma.case.findMany({
      where: { status: 'published' },
      orderBy: { publishedAt: 'desc' },
    })
  }

  // 全量（需登录，含草稿/下线，供管理后台）：pandaking 全量；agency 仅自己机构的案例
  listAll(user: { role?: string; agencyId?: string | null }) {
    const where = user.role === 'pandaking' ? {} : { agencyId: user.agencyId ?? '__none__' }
    return this.prisma.case.findMany({ where, orderBy: { createdAt: 'desc' } })
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

  // 管理端单查（含草稿）：权限校验后返回
  async getManage(id: string, user: { role?: string; agencyId?: string | null }) {
    await this.assertCanManage(id, user)
    return this.getById(id)
  }

  // 导入 HTML 微站直接创建草稿案例：sanitize → 抽 h1/<title> 作标题 → 建 draft
  // 目的地/天数/主题/价格等字段留空由运营在编辑页补全（HTML 内不可靠解析）
  async importCaseHtml(html: string, createdById: string, agencyId?: string | null) {
    const sanitized = this.uploadSvc.sanitizeHtml(html).html
    const title = extractHtmlTitle(html) || '未命名案例'
    return this.prisma.case.create({
      data: {
        title,
        destination: '',
        days: 0,
        theme: '',
        priceRange: '',
        contentHtml: sanitized,
        status: 'draft',
        createdById,
        agencyId: agencyId ?? null,
      },
    })
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
        // 归属机构随源路线（route.agencyId 为境外旅行社 org id；省地接社 province 不归属案例管理）
        agencyId: route.agencyId ?? null,
      },
    })
  }

  // 发布 + 自动补翻：中文内容 → TMT 生成 en/th 初稿（未翻译字段才翻；翻译失败不阻塞发布）
  async publish(id: string, user: { role?: string; agencyId?: string | null }) {
    await this.assertCanManage(id, user)
    const c = await this.getById(id)
    const data: Record<string, unknown> = { status: 'published', publishedAt: new Date() }
    const srcTitle = (c.title || '').trim()
    const srcDesc = (c.descZh || '').trim()
    if (srcTitle || srcDesc) {
      const transMeta: Record<string, { status: string; at: string }> = (c.transMeta as any) || {}
      const nowIso = new Date().toISOString()
      try {
        if (srcTitle && !c.titleEn) {
          data.titleEn = await this.translate.translateZh(srcTitle, 'en')
          transMeta.en = { status: 'machine', at: nowIso }
        }
        if (srcDesc && !c.descEn) {
          data.descEn = await this.translate.translateZh(srcDesc, 'en')
          transMeta.en = { status: 'machine', at: nowIso }
        }
        if (srcTitle && !c.titleTh) {
          data.titleTh = await this.translate.translateZh(srcTitle, 'th')
          transMeta.th = { status: 'machine', at: nowIso }
        }
        if (srcDesc && !c.descTh) {
          data.descTh = await this.translate.translateZh(srcDesc, 'th')
          transMeta.th = { status: 'machine', at: nowIso }
        }
        if (Object.keys(transMeta).length) data.transMeta = transMeta
      } catch (e: any) {
        // 翻译失败（如 TMT 未配置）不阻塞发布，下次发布/手动翻译再补
        this.logger.warn(`publish auto-translate skipped: ${e?.message || e}`)
      }
    }
    return this.prisma.case.update({ where: { id }, data })
  }

  // 手动触发 AI 翻译（编辑页按钮/重翻）：翻译中文 title/descZh → en/th，标记 machine
  async translateCase(id: string, user: { role?: string; agencyId?: string | null }) {
    await this.assertCanManage(id, user)
    const c = await this.getById(id)
    const srcTitle = (c.title || '').trim()
    const srcDesc = (c.descZh || '').trim()
    if (!srcTitle && !srcDesc) {
      throw new BadRequestException('暂无中文内容可翻译（请先填写标题或中文描述）')
    }
    const nowIso = new Date().toISOString()
    const [titleEn, descEn, titleTh, descTh] = await Promise.all([
      srcTitle ? this.translate.translateZh(srcTitle, 'en') : c.titleEn,
      srcDesc ? this.translate.translateZh(srcDesc, 'en') : c.descEn,
      srcTitle ? this.translate.translateZh(srcTitle, 'th') : c.titleTh,
      srcDesc ? this.translate.translateZh(srcDesc, 'th') : c.descTh,
    ])
    const transMeta = {
      ...((c.transMeta as any) || {}),
      en: { status: 'machine' as const, at: nowIso },
      th: { status: 'machine' as const, at: nowIso },
    }
    return this.prisma.case.update({
      where: { id },
      data: { titleEn, descEn, titleTh, descTh, transMeta },
    })
  }

  async unpublish(id: string, user: { role?: string; agencyId?: string | null }) {
    await this.assertCanManage(id, user)
    return this.prisma.case.update({ where: { id }, data: { status: 'offline', publishedAt: null } })
  }

  async update(
    id: string,
    input: Partial<Omit<CreateCaseInput, 'createdById'>>,
    user: { role?: string; agencyId?: string | null },
  ) {
    await this.assertCanManage(id, user)
    // 人工保存 En/Th 字段时标记 reviewed（人工校对）
    const data: Record<string, unknown> = { ...input }
    if (input.titleEn !== undefined || input.descEn !== undefined) {
      const cur = await this.getById(id)
      const meta = ((cur.transMeta as any) || {})
      data.transMeta = {
        ...meta,
        en: { status: 'reviewed', at: new Date().toISOString() },
        th: meta.th || undefined,
      }
    }
    if (input.titleTh !== undefined || input.descTh !== undefined) {
      const cur = await this.getById(id)
      const meta = ((cur.transMeta as any) || {})
      data.transMeta = {
        ...((data.transMeta as any) || meta),
        th: { status: 'reviewed', at: new Date().toISOString() },
      }
    }
    return this.prisma.case.update({ where: { id }, data })
  }

  remove(id: string, user: { role?: string; agencyId?: string | null }) {
    return this.assertCanManage(id, user).then(() => this.prisma.case.delete({ where: { id } }))
  }
}
