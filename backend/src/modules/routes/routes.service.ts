import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
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

export interface CreateRouteInput {
  customerName: string
  customerNameCn?: string
  country: string
  agency: string
  destination: string
  groupSize?: number
  travelDate?: string
  modeKey?: 'collab' | 'solo'
  createdById: string
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

  // 列表（按角色字段级过滤）
  async findAll(status?: string, role: Role = 'agency') {
    const routes = await this.prisma.route.findMany({
      where: status ? { statusKey: status } : undefined,
      include: { versions: { orderBy: { createdAt: 'desc' } } },
      orderBy: { updatedAt: 'desc' },
    })
    return routes.map((r) => this.serialize(r, role))
  }

  async findOne(id: string, role: Role = 'agency') {
    const route = await this.prisma.route
      .findUniqueOrThrow({
        where: { id },
        include: { versions: { orderBy: { createdAt: 'desc' } } },
      })
      .catch(() => {
        throw new NotFoundException('路线不存在')
      })
    return this.serialize(route, role)
  }

  // 新建路线 + 客户档案
  async create(input: CreateRouteInput) {
    const modeKey = input.modeKey ?? 'collab'
    // 协作模式由旅行社发起草案 → 初始「咨询中」（未提交）；一手 solo 直接「待报价」
    const statusKey: StatusKey =
      modeKey === 'solo' ? STATUS.AWAITING_QUOTE : STATUS.CONSULTING
    const route = await this.prisma.route.create({
      data: {
        customerName: input.customerName,
        customerNameCn: input.customerNameCn,
        country: input.country,
        agency: input.agency,
        destination: input.destination,
        groupSize: input.groupSize ?? 1,
        travelDate: input.travelDate ? new Date(input.travelDate) : null,
        statusKey,
        modeKey,
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
    return this.findOne(route.id)
  }

  // 保存并通知：生成新 version（version 自增），draft 决定是否对外
  async saveVersion(routeId: string, input: SaveVersionInput, role: Role = 'agency') {
    await this.prisma.route.findUniqueOrThrow({ where: { id: routeId } })
    const versions = await this.prisma.routeVersion.findMany({ where: { routeId } })
    const max = versions.reduce((m, v) => {
      const n = parseInt(String(v.version).replace(/\D/g, ''), 10)
      return Number.isNaN(n) ? m : Math.max(m, n)
    }, 0)
    const draft = input.draft ?? false
    const version = await this.prisma.routeVersion.create({
      data: {
        routeId,
        version: `v${max + 1}`,
        draft,
        itinerary: input.itinerary as object,
        quote: (input.quote as object) ?? null,
      },
    })
    // 对外 H5 链接（notify=true 且非草稿时生成协作共享 token）
    const shareLink =
      !draft && input.notify ? (await this.createShare(routeId, role, version.id)).link : null
    return { version: this.serializeVersion(version, role), shareLink }
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
    const masked = maskQuotePublic(version.quote) as { totals?: { guestPrice?: number } }
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

  // 版本历史
  async getVersions(routeId: string, role: Role = 'agency') {
    const versions = await this.prisma.routeVersion.findMany({
      where: { routeId },
      orderBy: { createdAt: 'desc' },
    })
    return versions.map((v) => this.serializeVersion(v, role))
  }

  async getVersion(routeId: string, versionId: string, role: Role = 'agency') {
    const v = await this.prisma.routeVersion
      .findFirstOrThrow({ where: { routeId, id: versionId } })
      .catch(() => {
        throw new NotFoundException('版本不存在')
      })
    return this.serializeVersion(v, role)
  }

  // —— 双向协作回路 ——
  // 旅行社提交草案 → 待一手确认
  submitDraft(routeId: string, role: Role) {
    return this.transition(routeId, ACTION.SUBMIT_DRAFT, role)
  }
  // 一手确认采用 → 待报价
  pkConfirm(routeId: string, role: Role) {
    return this.transition(routeId, ACTION.PK_CONFIRM, role)
  }
  // 一手回传修改反馈 → 待旅行社修订（反馈标注写回最新版本）
  async pkFeedback(routeId: string, feedback: unknown, role: Role) {
    const route = await this.transition(routeId, ACTION.PK_FEEDBACK, role)
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
  reviseByAgency(routeId: string, role: Role) {
    return this.transition(routeId, ACTION.SUBMIT_DRAFT, role)
  }
  // 一手发报价 v1 → 待反馈
  sendV1(routeId: string, role: Role) {
    return this.transition(routeId, ACTION.SEND_V1, role)
  }
  // 旅行社加价 → 待确认
  agencyMarkup(routeId: string, role: Role) {
    return this.transition(routeId, ACTION.AGENCY_MARKUP, role)
  }
  // 游客确认 → 已确认
  touristConfirm(routeId: string, role: Role) {
    return this.transition(routeId, ACTION.TOURIST_CONFIRM, role)
  }
  // 付款 → 已成单
  pay(routeId: string, role: Role) {
    return this.transition(routeId, ACTION.PAY, role)
  }
  // 拒绝 → 已流失
  reject(routeId: string, role: Role) {
    return this.transition(routeId, ACTION.REJECT, role)
  }

  // 通用转移：service 层强制校验，非法抛 409
  private async transition(routeId: string, action: ActionKey, role: Role) {
    const route = await this.prisma.route.findUniqueOrThrow({ where: { id: routeId } })
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
    return this.serialize(updated, role)
  }

  private async latestVersion(routeId: string) {
    const vs = await this.prisma.routeVersion.findMany({
      where: { routeId },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    return vs[0] ?? null
  }

  // 按角色序列化（字段级可见性）
  private serialize(route: any, role: Role) {
    const versions = (route.versions ?? []).map((v: any) =>
      this.serializeVersion(v, role),
    )
    return { ...route, versions }
  }

  private serializeVersion(v: any, role: Role) {
    return {
      ...v,
      quote: hideCostsForRole(v.quote, role),
    }
  }
}
