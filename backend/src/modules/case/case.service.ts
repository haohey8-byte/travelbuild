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

  // PandaKing 专属操作（发布/下线/删除/AI 翻译）
  private assertPandaking(user: { role?: string }) {
    if (user.role !== 'pandaking') throw new ForbiddenException('该操作仅限 PandaKing')
  }

  // 公开列表：仅已发布（案例展示页）
  listPublished() {
    return this.prisma.case.findMany({
      where: { status: 'published' },
      orderBy: { publishedAt: 'desc' },
    })
  }

  // 全量（需登录，含草稿/下线，供案例中心）：
  // - pandaking：全量（含草稿/下线/他人机构）。
  // - agency：自己机构的全部状态（供校对草稿）+ 全网已发布案例（含 PandaKing9 发布的，三角色可见）。
  // - provincial（或 agency 无 agencyId）：仅已发布案例（参考浏览，省地接社不归属案例管理）。
  listAll(user: { role?: string; agencyId?: string | null }) {
    let where: Record<string, unknown>
    if (user.role === 'pandaking') {
      where = {}
    } else if (user.role === 'agency' && user.agencyId) {
      where = { OR: [{ status: 'published' }, { agencyId: user.agencyId }] }
    } else {
      where = { status: 'published' }
    }
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

  // 发布 + 自动补翻：未翻译的字段（title/desc/highlights/daysContent/contentHtml）→ TMT 生成 en/th 初稿；
  // 翻译失败不阻塞发布；transMeta 改为模块化状态（按 title/desc/.../contentHtml 维度）
  async publish(id: string, user: { role?: string; agencyId?: string | null }) {
    this.assertPandaking(user)
    await this.assertCanManage(id, user)
    const c = await this.getById(id)
    const data: Record<string, unknown> = { status: 'published', publishedAt: new Date() }
    const meta: Record<string, any> = (c.transMeta as any) || {}
    const nowIso = new Date().toISOString()
    try {
      // title
      const srcTitle = (c.title || '').trim()
      if (srcTitle && !c.titleEn) {
        data.titleEn = await this.translate.translateZh(srcTitle, 'en')
        meta.title = { status: 'machine', at: nowIso }
      }
      if (srcTitle && !c.titleTh) {
        data.titleTh = await this.translate.translateZh(srcTitle, 'th')
        meta.title = { status: 'machine', at: nowIso }
      }
      // desc
      const srcDesc = (c.descZh || '').trim()
      if (srcDesc && !c.descEn) {
        data.descEn = await this.translate.translateZh(srcDesc, 'en')
        meta.desc = { status: 'machine', at: nowIso }
      }
      if (srcDesc && !c.descTh) {
        data.descTh = await this.translate.translateZh(srcDesc, 'th')
        meta.desc = { status: 'machine', at: nowIso }
      }
      // highlights（数组）
      if (Array.isArray(c.highlights) && c.highlights.length) {
        if (!c.highlightsEn?.length) data.highlightsEn = await this.translate.translateArray(c.highlights, 'en')
        if (!c.highlightsTh?.length) data.highlightsTh = await this.translate.translateArray(c.highlights, 'th')
        meta.highlights = { status: 'machine', at: nowIso }
      }
      // daysContent（每日图文）
      if (Array.isArray(c.daysContent) && c.daysContent.length) {
        if (!c.daysContentEn) data.daysContentEn = await this.translate.translateDaysContent(c.daysContent, 'en')
        if (!c.daysContentTh) data.daysContentTh = await this.translate.translateDaysContent(c.daysContent, 'th')
        meta.daysContent = { status: 'machine', at: nowIso }
      }
      // contentHtml（DOM 级）
      if (c.contentHtml) {
        if (!c.contentHtmlEn) data.contentHtmlEn = await this.translate.translateHtmlContent(c.contentHtml, 'en')
        if (!c.contentHtmlTh) data.contentHtmlTh = await this.translate.translateHtmlContent(c.contentHtml, 'th')
        meta.contentHtml = { status: 'machine', at: nowIso }
      }
      if (Object.keys(meta).length) data.transMeta = meta
    } catch (e: any) {
      // 翻译失败（如 TMT 未配置）不阻塞发布，下次发布/手动翻译再补
      this.logger.warn(`publish auto-translate skipped: ${e?.message || e}`)
    }
    return this.prisma.case.update({ where: { id }, data })
  }

  // 手动触发 AI 翻译（编辑页按钮）：按 fields 列表翻译，未指定则全部翻译
  // source 可选：传入当前编辑态表单中的中文源内容，优先于数据库旧值作为翻译源
  async translateCase(
    id: string,
    user: { role?: string; agencyId?: string | null },
    fields?: string[],
    source?: {
      title?: string
      descZh?: string
      highlights?: string[]
      daysContent?: any[]
      contentHtml?: string
    },
  ) {
    this.assertPandaking(user)
    await this.assertCanManage(id, user)
    const c = await this.getById(id)
    const wantAll = !fields || fields.length === 0
    const has = (f: string) => wantAll || fields.includes(f)
    const meta: Record<string, any> = (c.transMeta as any) || {}
    const nowIso = new Date().toISOString()
    const data: Record<string, unknown> = {}

    // source 优先于数据库当前值作为翻译源
    const srcTitle = ((source?.title ?? c.title) || '').trim()
    const srcDesc = ((source?.descZh ?? c.descZh) || '').trim()
    const srcHighlights = source?.highlights ?? c.highlights
    const srcDaysContent = source?.daysContent ?? c.daysContent
    const srcContentHtml = source?.contentHtml ?? c.contentHtml

    // 校验：请求的模块中至少有一个存在有效中文内容
    const TRANS_MODULES = ['title', 'desc', 'highlights', 'daysContent', 'contentHtml']
    const moduleHasSource = (f: string) => {
      switch (f) {
        case 'title':
          return srcTitle.length > 0
        case 'desc':
          return srcDesc.length > 0
        case 'highlights':
          return Array.isArray(srcHighlights) && srcHighlights.length > 0
        case 'daysContent':
          return Array.isArray(srcDaysContent) && srcDaysContent.length > 0
        case 'contentHtml':
          return (srcContentHtml || '').trim().length > 0
        default:
          return false
      }
    }
    const requestedWithSource = TRANS_MODULES.filter((f) => has(f) && moduleHasSource(f))
    if (requestedWithSource.length === 0) {
      throw new BadRequestException('暂无中文内容可翻译（请先在对应模块填写中文内容）')
    }

    // title / desc
    if (has('title') || has('desc')) {
      const [titleEn, descEn, titleTh, descTh] = await Promise.all([
        has('title') && srcTitle ? this.translate.translateZh(srcTitle, 'en') : Promise.resolve(c.titleEn),
        has('desc') && srcDesc ? this.translate.translateZh(srcDesc, 'en') : Promise.resolve(c.descEn),
        has('title') && srcTitle ? this.translate.translateZh(srcTitle, 'th') : Promise.resolve(c.titleTh),
        has('desc') && srcDesc ? this.translate.translateZh(srcDesc, 'th') : Promise.resolve(c.descTh),
      ])
      if (has('title') && srcTitle) {
        data.titleEn = titleEn
        data.titleTh = titleTh
        meta.title = { status: 'machine', at: nowIso }
      }
      if (has('desc') && srcDesc) {
        data.descEn = descEn
        data.descTh = descTh
        meta.desc = { status: 'machine', at: nowIso }
      }
    }

    // highlights（数组整体翻译）
    if (has('highlights') && Array.isArray(srcHighlights) && srcHighlights.length) {
      data.highlightsEn = await this.translate.translateArray(srcHighlights, 'en')
      data.highlightsTh = await this.translate.translateArray(srcHighlights, 'th')
      meta.highlights = { status: 'machine', at: nowIso }
    }

    // daysContent（每日图文）
    if (has('daysContent') && Array.isArray(srcDaysContent) && srcDaysContent.length) {
      data.daysContentEn = await this.translate.translateDaysContent(srcDaysContent, 'en')
      data.daysContentTh = await this.translate.translateDaysContent(srcDaysContent, 'th')
      meta.daysContent = { status: 'machine', at: nowIso }
    }

    // contentHtml（DOM 级）：translateHtmlContent 内部遇错会 throw BadRequestException（含失败数+首处样本+TMT 错误）
    if (has('contentHtml') && srcContentHtml) {
      data.contentHtmlEn = await this.translate.translateHtmlContent(srcContentHtml, 'en')
      data.contentHtmlTh = await this.translate.translateHtmlContent(srcContentHtml, 'th')
      meta.contentHtml = { status: 'machine', at: nowIso }
    }

    // 若传入了当前表单 source，同步保存中文源字段，避免只存翻译而源丢失导致刷新后不一致
    if (source) {
      if (source.title !== undefined) data.title = source.title
      if (source.descZh !== undefined) data.descZh = source.descZh
      if (source.highlights !== undefined) data.highlights = source.highlights
      if (source.daysContent !== undefined) data.daysContent = source.daysContent as Prisma.InputJsonValue
      if (source.contentHtml !== undefined) data.contentHtml = source.contentHtml
    }

    data.transMeta = meta
    return this.prisma.case.update({ where: { id }, data })
  }

  async unpublish(id: string, user: { role?: string; agencyId?: string | null }) {
    this.assertPandaking(user)
    await this.assertCanManage(id, user)
    return this.prisma.case.update({ where: { id }, data: { status: 'offline', publishedAt: null } })
  }

  async update(
    id: string,
    input: Partial<Omit<CreateCaseInput, 'createdById'>>,
    user: { role?: string; agencyId?: string | null },
  ) {
    await this.assertCanManage(id, user)

    // agency 仅允许修改多语言校对字段
    const AGENCY_EDITABLE_FIELDS = [
      'titleEn', 'titleTh', 'descEn', 'descTh',
      'highlightsEn', 'highlightsTh',
      'daysContentEn', 'daysContentTh',
      'contentHtmlEn', 'contentHtmlTh',
    ]
    const isAgency = user.role === 'agency'
    const filteredInput: Record<string, unknown> = isAgency
      ? Object.fromEntries(Object.entries(input).filter(([k]) => AGENCY_EDITABLE_FIELDS.includes(k)))
      : { ...input }

    // 人工保存多语言字段时，按模块标记 reviewed
    const cur = await this.getById(id)
    const meta: Record<string, any> = ((cur.transMeta as any) || {})
    const nowIso = new Date().toISOString()
    const touched = (key: string) => key in filteredInput && filteredInput[key] !== undefined

    if (touched('titleEn') || touched('titleTh')) meta.title = { status: 'reviewed', at: nowIso }
    if (touched('descEn') || touched('descTh')) meta.desc = { status: 'reviewed', at: nowIso }
    if (touched('highlightsEn') || touched('highlightsTh')) meta.highlights = { status: 'reviewed', at: nowIso }
    if (touched('daysContentEn') || touched('daysContentTh')) meta.daysContent = { status: 'reviewed', at: nowIso }
    if (touched('contentHtmlEn') || touched('contentHtmlTh')) meta.contentHtml = { status: 'reviewed', at: nowIso }

    const data: Record<string, unknown> = { ...filteredInput }
    if (Object.keys(meta).length) data.transMeta = meta
    return this.prisma.case.update({ where: { id }, data })
  }

  async remove(id: string, user: { role?: string; agencyId?: string | null }) {
    this.assertPandaking(user)
    await this.assertCanManage(id, user)
    return this.prisma.case.delete({ where: { id } })
  }
}
