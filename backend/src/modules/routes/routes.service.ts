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
import { hideCostsForRole, maskQuotePublic, recalcQuote, Role } from './role-visibility'
import { Prisma } from '@prisma/client'

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
    if (!provincialId?.trim()) throw new BadRequestException('必须指定省地接社机构')
    const target = await this.prisma.agency.findUnique({ where: { id: provincialId.trim() } })
    if (!target || target.role !== 'provincial') {
      throw new BadRequestException('省地接社机构不存在或角色不是省地接社')
    }
    const route = await this.prisma.route.findUniqueOrThrow({ where: { id: routeId } }).catch(() => {
      throw new NotFoundException('路线不存在')
    })
    const updated = await this.prisma.route.update({
      where: { id: routeId },
      data: { provincialId: provincialId.trim() },
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

  // 一手删除路线 + 归档备份：删除前把路线主记录及关联数据快照写入 RouteArchive 历史表，
  // 再硬删（cascade 删 versions/shares，手动删 feedbacks/costInquiries）。仅一手 PandaKing 可操作。
  async remove(id: string, principal?: RoutePrincipal) {
    // 权限：仅一手 PandaKing 可删除路线（按 PRD 权限矩阵）
    if (principal && principal.role !== 'pandaking') {
      throw new ForbiddenException('仅一手 PandaKing 可删除路线')
    }
    const route = await this.prisma.route
      .findUnique({
        where: { id },
        include: {
          versions: { orderBy: { createdAt: 'desc' } },
          shares: true,
        },
      })
      .catch(() => null)
    if (!route) {
      throw new NotFoundException('路线不存在')
    }
    // 关联数据快照（用于审计/恢复）
    const feedbacks = await this.prisma.routeFeedback.findMany({ where: { routeId: id } })
    const costInquiries = await this.prisma.costInquiry.findMany({ where: { routeId: id } })

    // 写入备份历史库（整条路线 + 版本 + 共享 + 反馈 + 询价）
    const deletedById = (principal as { id?: string })?.id ?? 'system'
    const deletedByName = (principal as { name?: string })?.name ?? 'PandaKing'
    await this.prisma.routeArchive.create({
      data: {
        routeId: route.id,
        routeData: route as object,
        versions: (route.versions ?? []) as object,
        shares: (route.shares ?? []) as object,
        feedbacks: feedbacks as object,
        costInquiries: costInquiries as object,
        deletedById,
        deletedByName,
        reason: null,
      },
    })

    // 硬删：先清无 cascade 的孤儿子表，再删 route（cascade 删 versions/shares）
    await this.prisma.routeFeedback.deleteMany({ where: { routeId: id } })
    await this.prisma.costInquiry.deleteMany({ where: { routeId: id } })
    await this.prisma.route.delete({ where: { id } })

    return { id, archived: true }
  }

  // 保存并通知：生成新 version（version 自增），draft 决定是否对外
  async saveVersion(routeId: string, input: SaveVersionInput, principal?: RoutePrincipal) {    await this.assertVisible(routeId, principal)
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
    let quote: any = null
    if (role === 'agency') {
      quote = this.mergeAgencyQuote(latest, input.quote)
    } else if (role === 'provincial') {
      quote = (latest?.quote as object) ?? null
    } else {
      // 一手 PandaKing：全量写入并据 items 重算 totals
      quote = recalcQuote(input.quote)
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
    // 该链接面向「客户/协作对方」公开，强制 public=true：仅暴露对客价 guestPrice，杜绝内部成本泄漏。
    let shareToken: string | null = null
    let shareLink: string | null = null
    if (!draft && input.notify) {
      const share = await this.createShare(routeId, principal?.role ?? 'agency', version.id, true)
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
  // isPublic=true 时仅暴露对客价 guestPrice（客户看板）；否则按 role 做字段级可见性。
  async createShare(routeId: string, role: Role = 'agency', versionId?: string, isPublic = false) {
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
      data: { token, routeId, versionId: vid, role, public: isPublic },
    })
    return { token: share.token, link: `/share/route/${share.token}` }
  }

  // 一手生成「省地接社协作 H5」令牌：同时完成分配 + 发起成本询价，
  // 一个 share 关联一个 CostInquiry，省地接社打开统一链接即可编辑行程并填写成本①。
  async createProvincialShare(routeId: string, provincialId?: string, principal?: RoutePrincipal) {
    if (principal && principal.role !== 'pandaking') {
      throw new ForbiddenException('仅一手 PandaKing 可发起省地接社协作')
    }
    const route = await this.prisma.route.findUniqueOrThrow({ where: { id: routeId } }).catch(() => {
      throw new NotFoundException('路线不存在')
    })

    // 如果调用方指定了省地接社，必须存在且角色正确；未指定则使用 route 上已分配的省地接社
    const effectiveProvincialId = provincialId?.trim() || route.provincialId
    if (!effectiveProvincialId) {
      throw new BadRequestException('请指定要协作的省地接社机构')
    }
    const target = await this.prisma.agency.findUnique({ where: { id: effectiveProvincialId } })
    if (!target || target.role !== 'provincial') {
      throw new BadRequestException('省地接社机构不存在或角色不是省地接社')
    }

    const token = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const [, inquiry] = await this.prisma.$transaction([
      this.prisma.route.update({
        where: { id: routeId },
        data: { provincialId: effectiveProvincialId },
      }),
      this.prisma.costInquiry.create({
        data: {
          routeId,
          provincialId: effectiveProvincialId,
          token: Math.random().toString(36).slice(2) + Date.now().toString(36),
          status: 'pending',
        },
      }),
    ])
    const shareRecord = await this.prisma.routeShare.create({
      data: { token, routeId, role: 'provincial', costInquiryId: inquiry.id },
    })
    return { token: shareRecord.token, link: `/h5/provincial-route/${shareRecord.token}` }
  }

  // 幂等获取「省地接社协作 H5」令牌：同一 route + 省地接社 复用已存在的令牌/成本询价，
  // 不重复创建（避免一手多次点「保存并通知/发起协作」后省地接社收到多个链接与多条询价记录）。
  // 仅在尚不存在时新建（逻辑等同 createProvincialShare）。
  async ensureProvincialShare(routeId: string, provincialId?: string, principal?: RoutePrincipal) {
    if (principal && principal.role !== 'pandaking') {
      throw new ForbiddenException('仅一手 PandaKing 可发起省地接社协作')
    }
    const route = await this.prisma.route.findUniqueOrThrow({ where: { id: routeId } }).catch(() => {
      throw new NotFoundException('路线不存在')
    })

    // 若调用方指定了省地接社，必须存在且角色正确；未指定则使用 route 上已分配的省地接社
    const effectiveProvincialId = provincialId?.trim() || route.provincialId
    if (!effectiveProvincialId) {
      throw new BadRequestException('请指定要协作的省地接社机构')
    }
    const target = await this.prisma.agency.findUnique({ where: { id: effectiveProvincialId } })
    if (!target || target.role !== 'provincial') {
      throw new BadRequestException('省地接社机构不存在或角色不是省地接社')
    }

    // 复用：查找该 route 下已存在的省地接社协作 share（且关联同一省地接社的成本询价）
    const existing = await this.prisma.routeShare.findFirst({
      where: {
        routeId,
        role: 'provincial',
        costInquiry: { provincialId: effectiveProvincialId },
      },
    })
    if (existing) {
      return { token: existing.token, link: `/h5/provincial-route/${existing.token}` }
    }

    // 不存在则新建（与原 createProvincialShare 逻辑一致）
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36)
    const [, inquiry] = await this.prisma.$transaction([
      this.prisma.route.update({
        where: { id: routeId },
        data: { provincialId: effectiveProvincialId },
      }),
      this.prisma.costInquiry.create({
        data: {
          routeId,
          provincialId: effectiveProvincialId,
          token: Math.random().toString(36).slice(2) + Date.now().toString(36),
          status: 'pending',
        },
      }),
    ])
    const shareRecord = await this.prisma.routeShare.create({
      data: { token, routeId, role: 'provincial', costInquiryId: inquiry.id },
    })
    return { token: shareRecord.token, link: `/h5/provincial-route/${shareRecord.token}` }
  }

  // 省地接社凭令牌在协作页编辑行程并填写成本①（利润默认0）；
  // 提交后成本①直接写回 routeVersion.quote.items（同名仅更新 cost1、保留 PandaKing 已设利润1，异名追加），
  // 同时记录到 costInquiry（供协作记录区与省地接社视角回显）。三角色共用同一报价页，仅角色隔离。
  async provincialEdit(
    token: string,
    input: { itinerary?: unknown; items?: { name?: string; cost1?: number; profit1Mode?: string; profit1?: number; type?: string }[] },
  ) {
    const share = await this.prisma.routeShare.findUnique({
      where: { token },
      include: { costInquiry: true },
    })
    if (!share || share.role !== 'provincial') {
      throw new NotFoundException('协作链接无效')
    }
    if (share.costInquiry == null) {
      throw new NotFoundException('协作链接未关联成本询价')
    }

    const incomingItems = Array.isArray(input.items) ? input.items : []
    // 省地接社仅提交成本①；利润1 强制 0（地接不填利润）
    const provincialItems = incomingItems.map((it) => ({
      name: String((it as any)?.name || '').trim() || '未命名',
      type: (it as any)?.type || 'other',
      cost1: Math.max(0, Number((it as any)?.cost1) || 0),
      profit1Mode: 'amount' as 'amount' | 'percent',
      profit1: 0,
    }))

    const latest = await this.latestVersion(share.routeId)
    const baseQuote = (latest?.quote as { items?: any[]; totals?: any }) || { items: [], totals: {} }
    const baseItems: any[] = Array.isArray(baseQuote.items)
      ? JSON.parse(JSON.stringify(baseQuote.items))
      : []

    // 合并省地接社成本①：同名项仅更新 cost1（保留 PandaKing 已设利润1），异名项追加（利润1=0）
    const mergedItems = baseItems
    for (const it of provincialItems) {
      if (!it.cost1) continue
      const existing = mergedItems.find((x) => String(x.name || '').trim() === it.name)
      if (existing) {
        existing.cost1 = it.cost1
      } else {
        mergedItems.push({ ...it })
      }
    }

    let version: any = null
    const recalcBase = { items: mergedItems, totals: { ...(baseQuote.totals || {}) } }
    if (input.itinerary != null) {
      const next = (parseInt(String(latest?.version).replace(/\D/g, '') || '0', 10)) + 1
      version = await this.prisma.routeVersion.create({
        data: {
          routeId: share.routeId,
          version: `v${next}`,
          draft: false,
          itinerary: input.itinerary as object,
          quote: recalcQuote(recalcBase) as object,
        },
      })
    } else if (provincialItems.length > 0 && latest?.id) {
      // 仅提交成本：更新最新版本的成本①
      await this.prisma.routeVersion.update({
        where: { id: latest.id },
        data: { quote: recalcQuote(recalcBase) as object },
      })
    }

    // 同步成本询价记录（供协作记录区展示与省地接社视角回显）
    let costInquiryUpdated: any = null
    if (provincialItems.length > 0) {
      const cost1 = provincialItems.reduce((s, it) => s + it.cost1, 0)
      costInquiryUpdated = await this.prisma.costInquiry.update({
        where: { id: share.costInquiry.id },
        data: {
          cost1: new Prisma.Decimal(cost1),
          costItems: provincialItems.map((it) => ({ name: it.name, amount: it.cost1 })) as Prisma.InputJsonValue,
          status: 'submitted',
        },
      })
    }

    return {
      version: version ? this.serializeVersion(version, 'provincial') : null,
      costInquiry: costInquiryUpdated
        ? {
            id: costInquiryUpdated.id,
            status: costInquiryUpdated.status,
            cost1: Number(costInquiryUpdated.cost1),
            costItems: costInquiryUpdated.costItems,
          }
        : {
            id: share.costInquiry.id,
            status: share.costInquiry.status,
            cost1: share.costInquiry.cost1 != null ? Number(share.costInquiry.cost1) : null,
            costItems: share.costInquiry.costItems,
          },
      link: `/h5/provincial-route/${share.token}`,
    }
  }

  // 旅行社仅可调整自身利润2（元/%），成本①与 PandaKing 利润1 取自上一版（旅行社不可见），
  // 并以 PandaKing 报价A 作为自身成本基线，重算对客总价 guestPrice。
  // ⚠️ 关键：旅行社 H5 保存时只回传 profit2（items 为空），必须保留上一版 items，
  // 否则 recalcQuote 会因 items 为空把 quoteA 重算为 0，破坏「报价A=成本基线」的稳定传递。
  private mergeAgencyQuote(prev: { quote?: unknown } | null | undefined, incoming: unknown): unknown {
    if (!incoming) return incoming
    const inQ = incoming as { items?: any[]; totals?: any }
    const prevQuote = (prev as any)?.quote ?? {}
    const prevItems: any[] = Array.isArray(prevQuote.items) ? prevQuote.items : []
    const prevTotals = (prevQuote.totals ?? {}) as { profit2Mode?: 'amount' | 'percent'; profit2?: number }
    // 旅行社未回传 items（H5 仅发 profit2）→ 沿用上一版 items，确保 quoteA 恒等于 PandaKing 报价A
    const items = Array.isArray(inQ.items) && inQ.items.length
      ? inQ.items.map((it: any, i: number) => {
          const p = prevItems[i] || {}
          return {
            ...it,
            cost1: Number(p.cost1) || 0,
            profit1Mode: (p.profit1Mode as 'amount' | 'percent') ?? 'amount',
            profit1: Number(p.profit1) || 0,
          }
        })
      : prevItems
    const profit2Mode = (inQ.totals?.profit2Mode as 'amount' | 'percent') ?? prevTotals.profit2Mode ?? 'amount'
    const profit2 = Number(inQ.totals?.profit2) || 0
    const quote = {
      items,
      totals: {
        ...(prevTotals as object),
        profit2Mode,
        profit2,
      },
    }
    return recalcQuote(quote)
  }

  // 协作 H5 视图（按 token 解析，报价仅暴露对客总价）
  // 对于省地接社协作 share，额外返回 costInquiry 状态/成本①，便于统一协作页编辑。
  async getH5(token: string) {
    const share = await this.prisma.routeShare.findUnique({
      where: { token },
      include: { costInquiry: true },
    })
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
      // 协作 H5 不强制要求「已发布」版本：草稿版即可作为协作起点；
      // 完全没有版本时从空白行程开始，允许省地接社从零协作编辑。
      version =
        (
          await this.prisma.routeVersion.findMany({
            where: { routeId: share.routeId },
            orderBy: { createdAt: 'desc' },
            take: 1,
          })
        )[0] ?? null
    }
    // 公开(对客)链接：仅暴露对客价 guestPrice，不泄漏内部成本①/利润；
    // 其余按 share.role 做字段级可见性（省地接社仅成本①、旅行社见报价A、一手全见）。
    const visible = (share.public
      ? maskQuotePublic(version?.quote ?? null)
      : hideCostsForRole(version?.quote ?? null, share.role)) as {
      items?: any[]
      totals?: any
    }
    const result: any = {
      token,
      routeId: route.id,
      destination: route.destination,
      customerNameCn: route.customerNameCn,
      customerName: route.customerName,
      groupSize: route.groupSize,
      travelDate: route.travelDate ? route.travelDate.toISOString() : null,
      version: version?.version ?? null,
      statusKey: route.statusKey,
      role: share.role,
      // 无版本时给空行程，省地接社可新建第一天（provincialEdit 会自动落 v1）
      itinerary: version?.itinerary ?? { days: [] },
      // 按角色字段级可见性返回报价：省地接社仅见成本①、旅行社见报价A、一手全见
      quote: visible,
      guestPrice: (visible?.totals?.guestPrice as number) ?? null,
    }
    if (share.role === 'provincial' && share.costInquiry) {
      result.costInquiry = {
        id: share.costInquiry.id,
        status: share.costInquiry.status,
        cost1: share.costInquiry.cost1 != null ? Number(share.costInquiry.cost1) : null,
        costItems: (share.costInquiry.costItems as { name: string; amount: number }[] | undefined) ?? [],
      }
    }
    return result
  }

  // 协作 H5 反馈提交（客户/对方在链接内填写修改意见）
  async submitFeedback(token: string, content: string, authorName?: string) {
    if (!content || !content.trim()) throw new BadRequestException('反馈内容不能为空')
    const share = await this.prisma.routeShare.findUnique({ where: { token } })
    if (!share) throw new NotFoundException('协作链接无效')
    // 反馈隔离：H5 链接反馈按 share.role 标记发送方角色（agency/provincial），
    // 接收方恒为 PandaKing（枢纽）。agency↔provincial 互不通信，读取时据此过滤。
    const fb = await this.prisma.routeFeedback.create({
      data: {
        routeId: share.routeId,
        versionId: share.versionId,
        token,
        authorName: authorName ?? null,
        // 公开(对客)链接的客户反馈不归入任何内部角色(authorRole=null)，
        // 避免客户反馈泄漏到 agency/provincial 视图；角色链接(旅行社/省地接社)按 share.role 标记。
        authorRole: share.public ? null : (share.role ?? null),
        source: 'h5',
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
  // 角色隔离：agency 仅见 agency↔PandaKing 反馈；provincial 仅见 provincial↔PandaKing 反馈；
  // PandaKing 为枢纽，可见全部。所有协作均以 PandaKing 为接收方，故按 authorRole 过滤即可隔离两路叶子角色。
  private feedbackRoleWhere(role?: Role) {
    if (!role || role === 'pandaking') return {}
    if (role === 'agency') return { authorRole: { in: ['agency', 'pandaking'] } }
    if (role === 'provincial') return { authorRole: { in: ['provincial', 'pandaking'] } }
    return {}
  }
  async getFeedback(routeId: string, principal?: RoutePrincipal) {
    if (principal) await this.assertVisible(routeId, principal)
    const fb = await this.prisma.routeFeedback.findMany({
      where: { routeId, ...this.feedbackRoleWhere(principal?.role) },
      orderBy: { createdAt: 'asc' },
    })
    const h5 = fb.map((f) => ({
      id: f.id,
      source: (f.source as 'h5' | 'console') ?? 'h5',
      authorRole: f.authorRole ?? null,
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
      authorRole: string
      authorName: string
      content: string
      createdAt: string
    }[] = []
    if (typeof pk === 'string' && pk.trim()) {
      consoleFb.push({
        id: `pk-${latest!.id}`,
        source: 'console',
        authorRole: 'pandaking',
        authorName: '一手地接社',
        content: pk,
        createdAt: latest!.createdAt.toISOString(),
      })
    }
    return [...h5, ...consoleFb]
  }

  // 公开链路：凭 token 读取反馈（H5 页免登录展示历史反馈，避免 401）
  // 仅返回本链接角色可见的 H5 反馈（不含控制台内部反馈），并按 share.role 隔离，
  // 杜绝 agency 看到 provincial 的反馈（反之亦然）。
  async getFeedbackByToken(token: string) {
    const share = await this.prisma.routeShare.findUnique({ where: { token } })
    if (!share) throw new NotFoundException('协作链接无效')
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('协作链接已过期')
    }
    // 公开(对客)链接：面向终端客户。客户反馈 authorRole 存为 null（不归入任何内部角色），
    // 故客户视图仅显示「一手 PandaKing 的回复」+「本链接客户自己提交的反馈(token 匹配)」，
    // 彻底杜绝客户看到 agency/provincial 内部反馈，也杜绝客户反馈泄漏到 agency/provincial 视图。
    const fbWhere = share.public
      ? { OR: [{ authorRole: 'pandaking' }, { token: share.token }] }
      : this.feedbackRoleWhere(share.role)
    const fb = await this.prisma.routeFeedback.findMany({
      where: { routeId: share.routeId, source: 'h5', ...fbWhere },
      orderBy: { createdAt: 'asc' },
    })
    return fb.map((f) => ({
      id: f.id,
      source: (f.source as 'h5' | 'console') ?? 'h5',
      authorRole: f.authorRole ?? null,
      authorName: f.authorName,
      content: f.content,
      createdAt: f.createdAt.toISOString(),
    }))
  }

  // 控制台协作反馈：境外旅行社 / 省地接社 在路线详情页把报价建议 / 成本说明提交给一手 PandaKing。
  // 与「一手回传反馈」(pkFeedback) 不同，本接口不触发状态流转，仅落反馈记录（协作时间线可见）。
  async submitConsoleFeedback(
    routeId: string,
    content: string,
    authorName?: string,
    authorRole?: string,
    principal?: RoutePrincipal,
  ) {
    if (principal) {
      if (principal.role === 'pandaking') {
        throw new ForbiddenException('一手请使用「状态流转 → 回传反馈」提交修改意见')
      }
      await this.assertVisible(routeId, principal)
    }
    if (!content || !content.trim()) throw new BadRequestException('反馈内容不能为空')
    const latest = await this.latestVersion(routeId)
    const fb = await this.prisma.routeFeedback.create({
      data: {
        routeId,
        versionId: latest?.id ?? null,
        authorName: authorName ?? null,
        authorRole: authorRole ?? null,
        source: 'console',
        content,
      },
    })
    return {
      id: fb.id,
      source: fb.source,
      authorRole: fb.authorRole,
      authorName: fb.authorName,
      content: fb.content,
      createdAt: fb.createdAt.toISOString(),
    }
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
