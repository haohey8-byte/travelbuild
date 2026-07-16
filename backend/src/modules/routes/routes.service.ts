import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import {
  ACTION,
  ActionKey,
  applyTransition,
  InvalidTransitionError,
  STATUS,
  StatusKey,
  validateStateMachine,
} from './state-machine'
import { hideCostsForRole, maskQuotePublic, Role } from './role-visibility'

// 路线操作主体（来自 JWT 守卫注入）：用于机构间物理隔绝
type RoutePrincipal = { role: Role; agencyId: string | null }

export interface CreateRouteInput {
  customerName: string
  customerNameCn?: string
  country: string
  agency: string
  agencyId?: string // 一手创建时必须指定境外旅行社机构编号
  destination: string
  groupSize?: number
  travelDate?: string
  modeKey?: 'collab' | 'solo'
  createdById: string
  creatorRole?: Role
  creatorAgencyId?: string | null
  // 旅行社发起的结构化行程规划草案（按天：城市/景点/住宿/餐饮偏好 + 预算区间）
  initialDraft?: { itinerary: unknown; quote?: unknown }
}

export interface SaveVersionInput {
  itinerary: unknown
  quote?: unknown
  draft?: boolean
  notify?: boolean
}

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {
    // 启动自检：状态机转移表无悬空目标
    validateStateMachine()
  }

  // 列表（按角色字段级过滤 + 机构物理隔绝）
  // 物理隔绝：一手见全部；境外旅行社仅见「本机构(agencyId)」路线；省地接社**无控制台路线视图**（按 PRD 权限矩阵）。
  async findAll(status?: string, principal?: RoutePrincipal) {
    const role = principal?.role ?? 'agency'
    // 省地接社没有控制台路线列表权限（仅通过 H5 成本询价 / 协作 H5 交互）
    if (role === 'provincial') return []
    const where: { statusKey?: string; agencyId?: string } = status
      ? { statusKey: status }
      : {}
    // 旧 token 可能缺少 agencyId（DEV_BYPASS_AUTH 或历史 token），降级为 pandaking 视角避免看板空白
    const effectiveRole = role === 'agency' && !principal?.agencyId ? 'pandaking' : role
    if (effectiveRole === 'agency') {
      where.agencyId = principal!.agencyId!
    }
    const routes = await this.prisma.route.findMany({
      where,
      include: { versions: { orderBy: { createdAt: 'desc' } } },
      orderBy: { updatedAt: 'desc' },
    })
    return routes.map((r) => this.serialize(r, effectiveRole))
  }

  async findOne(id: string, principal?: RoutePrincipal) {
    const route = await this.prisma.route
      .findUniqueOrThrow({
        where: { id },
        include: { versions: { orderBy: { createdAt: 'desc' } } },
      })
      .catch(() => {
        throw new NotFoundException('路线不存在')
      })
    const role = principal?.role ?? 'agency'
    // 省地接社没有控制台路线详情权限（按 PRD 权限矩阵）
    if (role === 'provincial') {
      throw new NotFoundException('路线不存在')
    }
    // 旧 token 降级：agency 缺 agencyId 时视为 pandaking，避免误报「路线不存在」
    const effectiveRole = role === 'agency' && !principal?.agencyId ? 'pandaking' : role
    // 物理隔绝校验：境外旅行社仅见本机构路线
    if (effectiveRole === 'agency' && (!principal?.agencyId || route.agencyId !== principal.agencyId)) {
      throw new NotFoundException('路线不存在')
    }
    return this.serialize(route, effectiveRole)
  }

  // 一手将路线分配给某省地接社：分配后该省地接社可见并参与协作规划与报价（成本询价）
  async assignProvincial(routeId: string, provincialId: string, principal?: RoutePrincipal) {
    if (principal && principal.role !== 'pandaking') {
      throw new ForbiddenException('仅一手 PandaKing 可分配省地接社')
    }
    const route = await this.prisma.route.findUniqueOrThrow({ where: { id: routeId } }).catch(() => {
      throw new NotFoundException('路线不存在')
    })
    const updated = await this.prisma.route.update({
      where: { id: routeId },
      data: { provincialId },
      include: { versions: { orderBy: { createdAt: 'desc' } } },
    })
    return this.serialize(updated, principal?.role ?? 'pandaking')
  }

  // 新建路线 + 客户档案
  async create(input: CreateRouteInput, principal?: RoutePrincipal) {
    const modeKey = input.modeKey ?? 'collab'
    const role = principal?.role ?? 'agency'
    // 省地接社不能创建路线（按 PRD 权限矩阵）
    if (role === 'provincial') {
      throw new ForbiddenException('省地接社无权创建路线')
    }
    let agencyId: string | null = null
    let agencyName: string = input.agency?.trim() || ''
    // 一手创建：必须指定 agencyId（选择境外旅行社）
    if (role === 'pandaking') {
      if (!input.agencyId?.trim()) {
        throw new BadRequestException('一手创建路线必须指定境外旅行社（agencyId）')
      }
      const agencyOrg = await this.prisma.agency.findUnique({
        where: { id: input.agencyId.trim() },
      })
      if (!agencyOrg || agencyOrg.role !== 'agency') {
        throw new BadRequestException('指定的境外旅行社机构不存在')
      }
      agencyId = agencyOrg.id
      agencyName = agencyOrg.name
    } else if (role === 'agency') {
      // 旅行社创建：必须已绑定机构，并自动归属本机构
      if (!principal?.agencyId) {
        throw new BadRequestException('当前旅行社账号未绑定机构，无法创建路线')
      }
      // 若前端传了 agencyId，必须与本机构一致（防止伪造）
      if (input.agencyId?.trim() && input.agencyId.trim() !== principal.agencyId) {
        throw new ForbiddenException('只能创建归属本机构的路线')
      }
      agencyId = principal.agencyId
      // 优先使用本机构名称
      const agencyOrg = await this.prisma.agency.findUnique({ where: { id: agencyId } })
      agencyName = agencyOrg?.name || agencyName
    }
    // 协作模式由旅行社发起草案 → 初始「咨询中」（未提交）；一手 solo 直接「待报价」
    const statusKey: StatusKey =
      modeKey === 'solo' ? STATUS.AWAITING_QUOTE : STATUS.CONSULTING
    const route = await this.prisma.route.create({
      data: {
        customerName: input.customerName,
        customerNameCn: input.customerNameCn,
        country: input.country,
        agency: agencyName,
        destination: input.destination,
        groupSize: input.groupSize ?? 1,
        travelDate: input.travelDate ? new Date(input.travelDate) : null,
        statusKey,
        modeKey,
        agencyId,
        createdById: input.createdById,
      },
    })
    // 若有初始草案，落第一个版本（草稿态）
    if (input.initialDraft) {
      await this.prisma.routeVersion.create({
        data: {
          routeId: route.id,
          version: 'v1',
          draft: true,
          itinerary: input.initialDraft.itinerary as object,
          quote: (input.initialDraft.quote as object) ?? null,
        },
      })
    }
    // 直接查询并返回（不走 findOne 的权限校验，因为刚创建的路线创建者必然可见）
    const created = await this.prisma.route
      .findUniqueOrThrow({
        where: { id: route.id },
        include: { versions: { orderBy: { createdAt: 'desc' } } },
      })
      .catch(() => {
        throw new NotFoundException('路线不存在')
      })
    return this.serialize(created, principal?.role ?? 'pandaking')
  }

  // 保存并通知：生成新 version（version 自增），draft 决定是否对外
  async saveVersion(routeId: string, input: SaveVersionInput, principal?: RoutePrincipal) {
    await this.assertVisible(routeId, principal)
    const role = principal?.role ?? 'agency'
    const versions = await this.prisma.routeVersion.findMany({ where: { routeId } })
    const max = versions.reduce((m, v) => {
      const n = parseInt(String(v.version).replace(/\D/g, ''), 10)
      return Number.isNaN(n) ? m : Math.max(m, n)
    }, 0)
    const draft = input.draft ?? false
    // 报价按角色隔离写入：
    //  - 一手(pandaking)：全量写入 cost1/cost2/markup
    //  - 旅行社(agency)：仅可改自身加价 markup，成本①/②取自上一版（旅行社不可见）并重算对客总价
    //  - 省地接社(provincial)：不写价，价格保留上一版（地接成本由成本询价闭环回填）
    const latest = await this.latestVersion(routeId)
    let quote: any = input.quote ?? null
    if (role === 'agency') {
      quote = this.mergeAgencyQuote(latest, input.quote)
    } else if (role === 'provincial') {
      quote = (latest?.quote as object) ?? null
    }
    const version = await this.prisma.routeVersion.create({
      data: {
        routeId,
        version: `v${max + 1}`,
        draft,
        itinerary: input.itinerary as object,
        quote,
      },
    })
    // 对外 H5 链接（notify=true 且非草稿时生成协作共享 token）
    let shareToken: string | null = null
    let shareLink: string | null = null
    if (!draft && input.notify) {
      const share = await this.createShare(routeId, principal?.role ?? 'agency', version.id)
      shareToken = share.token
      shareLink = share.link
    }
    return {
      version: this.serializeVersion(version, principal?.role ?? 'agency'),
      shareLink,
      shareToken,
    }
  }

  // 生成协作 H5 共享令牌（默认指向最新非草稿版本）
  async createShare(routeId: string, role: Role = 'agency', versionId?: string) {
    let vid = versionId
    if (!vid) {
      const vers = await this.prisma.routeVersion.findMany({
        where: { routeId, draft: false },
        orderBy: { createdAt: 'desc' },
        take: 1,
      })
      if (!vers.length) {
        throw new BadRequestException('该路线暂无对外版本（请先保存非草稿版本）')
      }
      vid = vers[0].id
    }
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const share = await this.prisma.routeShare.create({
      data: { token, routeId, versionId: vid, role },
    })
    return { token: share.token, link: `/share/route/${share.token}` }
  }

  // 一手生成「省地接社协作 H5」令牌：省地接社凭链接在 H5 内查看+编辑分配给自己的行程并反馈
  async createProvincialShare(routeId: string, principal?: RoutePrincipal) {
    if (principal && principal.role !== 'pandaking') {
      throw new ForbiddenException('仅一手 PandaKing 可生成省地接社协作 H5')
    }
    const route = await this.prisma.route
      .findUniqueOrThrow({ where: { id: routeId } })
      .catch(() => {
        throw new NotFoundException('路线不存在')
      })
    if (!route.provincialId) {
      throw new BadRequestException('请先将路线分配给省地接社，再生成协作 H5')
    }
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36)
    await this.prisma.routeShare.create({
      data: { token, routeId, role: 'provincial' },
    })
    return { token, link: `/h5/provincial-route/${token}` }
  }

  // 省地接社凭令牌在 H5 内编辑分配给自己的行程（仅改行程，价格保留上一版），保存并生成新版本
  async provincialEdit(token: string, itinerary: unknown) {
    const share = await this.prisma.routeShare.findUnique({ where: { token } })
    if (!share || share.role !== 'provincial') {
      throw new NotFoundException('协作链接无效')
    }
    const latest = await this.latestVersion(share.routeId)
    const next = (parseInt(String(latest?.version).replace(/\D/g, '') || '0', 10)) + 1
    const version = await this.prisma.routeVersion.create({
      data: {
        routeId: share.routeId,
        version: `v${next}`,
        draft: false,
        itinerary: itinerary as object,
        quote: (latest?.quote as object) ?? null,
      },
    })
    return {
      version: this.serializeVersion(version, 'provincial'),
      link: `/h5/route/${share.token}`,
    }
  }

  // 旅行社仅可调整自身加价(markup)，成本①/②取自上一版（旅行社不可见），并重算对客总价
  private mergeAgencyQuote(prev: { quote?: unknown } | null | undefined, incoming: unknown): unknown {
    if (!incoming) return incoming
    const inQ = incoming as { items?: any[]; totals?: any }
    const prevItems = Array.isArray((prev as any)?.quote?.items) ? (prev as any).quote.items : []
    const items = (inQ.items ?? []).map((it: any, i: number) => {
      const p = prevItems[i] || {}
      const cost1 = Number(p.cost1) || 0
      const cost2 = Number(p.cost2) || 0
      const markup = Number(it.markup) || 0
      return { ...it, cost1, cost2, markup, guestPrice: cost1 + cost2 + markup }
    })
    const totals = {
      cost1: items.reduce((s: number, it: any) => s + (Number(it.cost1) || 0), 0),
      cost2: items.reduce((s: number, it: any) => s + (Number(it.cost2) || 0), 0),
      markup: items.reduce((s: number, it: any) => s + (Number(it.markup) || 0), 0),
      guestPrice: 0,
    }
    totals.guestPrice = totals.cost1 + totals.cost2 + totals.markup
    return { ...inQ, items, totals }
  }

  // 协作 H5 只读视图（按 token 解析，报价仅暴露对客总价）
  async getH5(token: string) {
    const share = await this.prisma.routeShare.findUnique({ where: { token } })
    if (!share) throw new NotFoundException('协作链接无效')
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('协作链接已过期')
    }
    const route = await this.prisma.route
      .findUniqueOrThrow({ where: { id: share.routeId } })
      .catch(() => {
        throw new NotFoundException('路线不存在')
      })
    let version = share.versionId
      ? await this.prisma.routeVersion.findUnique({ where: { id: share.versionId } })
      : null
    if (!version) {
      version =
        (
          await this.prisma.routeVersion.findMany({
            where: { routeId: share.routeId, draft: false },
            orderBy: { createdAt: 'desc' },
            take: 1,
          })
        )[0] ?? null
    }
    if (!version) throw new NotFoundException('该路线暂无对外版本')
    const masked = maskQuotePublic(version.quote) as {
      items?: { type?: string; guestPrice?: number }[]
      totals?: { guestPrice?: number }
    }
    return {
      token,
      routeId: route.id,
      destination: route.destination,
      customerNameCn: route.customerNameCn,
      customerName: route.customerName,
      groupSize: route.groupSize,
      travelDate: route.travelDate ? route.travelDate.toISOString() : null,
      version: version.version,
      statusKey: route.statusKey,
      itinerary: version.itinerary,
      // 净化报价：仅含对客报价（guestPrice），不含成本①/②/加价（公开 H5 不泄漏内部成本）
      quote: masked,
      guestPrice: masked?.totals?.guestPrice ?? null,
    }
  }

  // 协作 H5 反馈提交（客户/对方在链接内填写修改意见）
  async submitFeedback(token: string, content: string, authorName?: string) {
    if (!content || !content.trim()) throw new BadRequestException('反馈内容不能为空')
    const share = await this.prisma.routeShare.findUnique({ where: { token } })
    if (!share) throw new NotFoundException('协作链接无效')
    const fb = await this.prisma.routeFeedback.create({
      data: {
        routeId: share.routeId,
        versionId: share.versionId,
        token,
        authorName: authorName ?? null,
        content,
      },
    })
    return {
      id: fb.id,
      content: fb.content,
      authorName: fb.authorName,
      createdAt: fb.createdAt.toISOString(),
    }
  }

  // 反馈记录（协作双方可见）：H5 链接提交的反馈 + 一手「回传反馈」(写在最新版本 itinerary.pkFeedback)
  async getFeedback(routeId: string, principal?: RoutePrincipal) {
    if (principal) await this.assertVisible(routeId, principal)
    const fb = await this.prisma.routeFeedback.findMany({
      where: { routeId },
      orderBy: { createdAt: 'asc' },
    })
    const h5 = fb.map((f) => ({
      id: f.id,
      source: 'h5' as const,
      authorName: f.authorName,
      content: f.content,
      createdAt: f.createdAt.toISOString(),
    }))
    // 一手「回传反馈」写在最新版本的 itinerary.pkFeedback
    const latest = await this.latestVersion(routeId)
    const pk = latest?.itinerary && (latest.itinerary as { pkFeedback?: unknown }).pkFeedback
    const consoleFb: {
      id: string
      source: 'console'
      authorName: string
      content: string
      createdAt: string
    }[] = []
    if (typeof pk === 'string' && pk.trim()) {
      consoleFb.push({
        id: `pk-${latest!.id}`,
        source: 'console',
        authorName: '一手地接社',
        content: pk,
        createdAt: latest!.createdAt.toISOString(),
      })
    }
    return [...h5, ...consoleFb]
  }

  // 公开链路：凭 token 读取反馈（H5 页免登录展示历史反馈，避免 401）
  async getFeedbackByToken(token: string) {
    const share = await this.prisma.routeShare.findUnique({ where: { token } })
    if (!share) throw new NotFoundException('协作链接无效')
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('协作链接已过期')
    }
    return this.getFeedback(share.routeId)
  }

  // 版本历史
  async getVersions(routeId: string, principal?: RoutePrincipal) {
    if (principal) await this.assertVisible(routeId, principal)
    const versions = await this.prisma.routeVersion.findMany({
      where: { routeId },
      orderBy: { createdAt: 'desc' },
    })
    return versions.map((v) => this.serializeVersion(v, principal?.role ?? 'agency'))
  }

  async getVersion(routeId: string, versionId: string, principal?: RoutePrincipal) {
    if (principal) await this.assertVisible(routeId, principal)
    const v = await this.prisma.routeVersion
      .findFirstOrThrow({ where: { routeId, id: versionId } })
      .catch(() => {
        throw new NotFoundException('版本不存在')
      })
    return this.serializeVersion(v, principal?.role ?? 'agency')
  }

  // 物理隔绝断言：境外旅行社仅可见本机构路线；省地接社仅可见被分配的路线
  private async assertVisible(routeId: string, principal?: RoutePrincipal) {
    if (!principal) return
    const route = await this.prisma.route.findUnique({ where: { id: routeId } })
    if (!route) throw new NotFoundException('路线不存在')
    // 省地接社没有控制台路线操作权限（按 PRD 权限矩阵），所有交互均通过 H5 token 完成
    if (principal.role === 'provincial') {
      throw new NotFoundException('路线不存在')
    }
    // 旧 token 降级：agency 缺 agencyId 时视为 pandaking，跳过隔离校验
    if (principal.role === 'agency' && !principal.agencyId) return
    if (principal.role === 'agency' && route.agencyId !== principal.agencyId) {
      throw new NotFoundException('路线不存在')
    }
  }

  // —— 双向协作回路 ——
  // 旅行社提交草案 → 待一手确认
  submitDraft(routeId: string, principal: RoutePrincipal) {
    return this.transition(routeId, ACTION.SUBMIT_DRAFT, principal)
  }
  // 一手确认采用 → 待报价
  pkConfirm(routeId: string, principal: RoutePrincipal) {
    return this.transition(routeId, ACTION.PK_CONFIRM, principal)
  }
  // 一手回传修改反馈 → 待旅行社修订（反馈标注写回最新版本）
  async pkFeedback(routeId: string, feedback: unknown, principal: RoutePrincipal) {
    const route = await this.transition(routeId, ACTION.PK_FEEDBACK, principal)
    const latest = await this.latestVersion(routeId)
    if (latest) {
      await this.prisma.routeVersion.update({
        where: { id: latest.id },
        data: {
          itinerary: {
            ...(latest.itinerary as object),
            pkFeedback: feedback,
          } as object,
        },
      })
    }
    return route
  }
  // 旅行社修订重交 → 待一手确认
  reviseByAgency(routeId: string, principal: RoutePrincipal) {
    return this.transition(routeId, ACTION.SUBMIT_DRAFT, principal)
  }
  // 一手发报价 v1 → 待反馈
  sendV1(routeId: string, principal: RoutePrincipal) {
    return this.transition(routeId, ACTION.SEND_V1, principal)
  }
  // 旅行社加价 → 待确认
  agencyMarkup(routeId: string, principal: RoutePrincipal) {
    return this.transition(routeId, ACTION.AGENCY_MARKUP, principal)
  }
  // 游客确认 → 已确认
  touristConfirm(routeId: string, principal: RoutePrincipal) {
    return this.transition(routeId, ACTION.TOURIST_CONFIRM, principal)
  }
  // 付款 → 已成单
  pay(routeId: string, principal: RoutePrincipal) {
    return this.transition(routeId, ACTION.PAY, principal)
  }
  // 拒绝 → 已流失
  reject(routeId: string, principal: RoutePrincipal) {
    return this.transition(routeId, ACTION.REJECT, principal)
  }

  // 通用转移：service 层强制校验，非法抛 409
  private async transition(routeId: string, action: ActionKey, principal: RoutePrincipal) {
    const route = await this.prisma.route.findUniqueOrThrow({ where: { id: routeId } })
    // 省地接社不参与商业状态流转（提交草案/确认/加价等），其协作通过「行程编辑(saveVersion)」与「成本询价」完成
    if (principal.role === 'provincial') {
      throw new ForbiddenException('省地接社不参与商业状态流转，请通过行程编辑与成本询价协作')
    }
    // 物理隔绝：境外旅行社只能操作「本机构」路线；一手可操作全部
    if (principal.role === 'agency' && route.agencyId !== principal.agencyId) {
      throw new NotFoundException('路线不存在')
    }
    let to: StatusKey
    try {
      to = applyTransition(route.statusKey, action)
    } catch (e) {
      if (e instanceof InvalidTransitionError) {
        throw new ConflictException(
          `状态转移非法：${route.statusKey} 不能执行 ${action}`,
        )
      }
      throw e
    }
    const updated = await this.prisma.route.update({
      where: { id: routeId },
      data: { statusKey: to },
      include: { versions: { orderBy: { createdAt: 'desc' } } },
    })
    return this.serialize(updated, principal.role)
  }

  private async latestVersion(routeId: string) {
    const vs = await this.prisma.routeVersion.findMany({
      where: { routeId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    return vs[0] ?? null
  }

  // 按角色序列化（字段级可见性 + 机构物理隔绝）
  // 视线剥离：境外旅行社不返回 provincialId；省地接社不返回 agencyId 与 agency(旅行社名称)，
  // 确保双方互不知道对方的存在与机构标识（一手保留全部）。
  private serialize(route: any, role: Role) {
    const { versions, ...rest } = route
    const safe: Record<string, unknown> = { ...rest }
    if (role === 'agency') {
      delete safe.provincialId
    } else if (role === 'provincial') {
      delete safe.agencyId
      delete safe.agency
    }
    return {
      ...safe,
      versions: (versions ?? []).map((v: any) => this.serializeVersion(v, role)),
    }
  }

  private serializeVersion(v: any, role: Role) {
    return {
      ...v,
      quote: hideCostsForRole(v.quote, role),
    }
  }
}
