import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Prisma } from '@prisma/client'
import type { AuthPrincipal } from '../auth/auth.service'
import { recalcQuote } from './role-visibility'

// 成本询价（一手 ↔ 省地接社）—— 对应 doc/04-接口契约/H5协作链接.md 与 PRD「成本询价」
// 流程：一手在路线详情发起询价（指定省地接社机构）→ 生成 H5 链接（复制发微信群）
//       → 省地接社打开 H5 填成本①并提交 → 一手在路线详情「应用」把成本①写入路线报价
// 物理隔绝：询价仅对「该省地接社机构」可见；境外旅行社不可见任何询价。
@Injectable()
export class CostInquiryService {
  constructor(private readonly prisma: PrismaService) {}

  private genToken() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }

  // 一手发起成本询价（指定省地接社机构）
  async create(routeId: string, provincialId: string, caller: AuthPrincipal) {
    if (caller.role !== 'pandaking') {
      throw new ForbiddenException('仅一手 PandaKing 可发起成本询价')
    }
    if (!provincialId?.trim()) throw new BadRequestException('必须指定省地接社机构编号')
    const target = await this.prisma.agency.findUnique({ where: { id: provincialId.trim() } })
    if (!target || target.role !== 'provincial') {
      throw new BadRequestException('省地接社机构不存在或角色不是省地接社')
    }
    const route = await this.prisma.route.findUnique({ where: { id: routeId } })
    if (!route) throw new NotFoundException('路线不存在')
    const ci = await this.prisma.costInquiry.create({
      data: {
        routeId,
        provincialId: provincialId.trim(),
        token: this.genToken(),
        status: 'pending',
      },
    })
    return { id: ci.id, token: ci.token, link: `/h5/cost-inquiry/${ci.token}` }
  }

  // H5 免登录渲染：仅暴露路线摘要（目的地/客户名/人数），不暴露价格
  async getByToken(token: string) {
    const ci = await this.prisma.costInquiry.findUniqueOrThrow({ where: { token } }).catch(() => {
      throw new NotFoundException('询价链接无效')
    })
    const route = await this.prisma.route.findUniqueOrThrow({ where: { id: ci.routeId } })
    const owner = await this.prisma.user.findUnique({
      where: { id: route.createdById },
      select: { name: true },
    })
    let agencyName: string | null = null
    if (ci.provincialId) {
      const ag = await this.prisma.agency.findUnique({ where: { id: ci.provincialId } })
      agencyName = ag?.name ?? null
    }
    return {
      token: ci.token,
      status: ci.status,
      cost1: ci.cost1 != null ? Number(ci.cost1) : null,
      costItems: (ci.costItems as { name: string; amount: number }[] | undefined) ?? [],
      // 路线归属账号名（创建者，即 PandaKing 平台方），用于 H5 内替代「一手」字眼
      ownerName: owner?.name ?? 'PandaKing',
      // 被询价省地接社机构名，用于回传通知文案个性化（显示为具体机构名）
      agencyName,
      route: {
        id: route.id,
        customerName: route.customerName,
        customerNameCn: route.customerNameCn,
        destination: route.destination,
        groupSize: route.groupSize,
        travelDate: route.travelDate ? route.travelDate.toISOString() : null,
      },
    }
  }

  // 省地接社提交成本价①（H5 免登录：链接即授权；若带 principal 则校验机构归属）
  async submit(token: string, cost1: number, caller?: AuthPrincipal) {
    if (cost1 == null || Number.isNaN(Number(cost1)) || Number(cost1) < 0) {
      throw new BadRequestException('成本①必须为非负数字')
    }
    const ci = await this.prisma.costInquiry.findUniqueOrThrow({ where: { token } }).catch(() => {
      throw new NotFoundException('询价链接无效')
    })
    if (ci.status === 'submitted') throw new ConflictException('该询价已提交，不可重复提交')
    if (caller && caller.role === 'provincial' && caller.agencyId !== ci.provincialId) {
      throw new NotFoundException('无权操作该询价')
    }
    const updated = await this.prisma.costInquiry.update({
      where: { id: ci.id },
      data: { cost1: new Prisma.Decimal(Number(cost1)), status: 'submitted' },
    })
    return { id: updated.id, status: updated.status, cost1: Number(updated.cost1) }
  }

  // 列表（按权限隔离）：一手可见全部（可按 routeId 过滤）；省地接社仅见本机构；旅行社不可见
  async list(routeId: string | undefined, caller: AuthPrincipal) {
    const where: { routeId?: string; provincialId?: string } = {}
    if (routeId) where.routeId = routeId
    if (caller.role === 'pandaking') {
      // 可见全部
    } else if (caller.role === 'provincial') {
      if (!caller.agencyId) return []
      where.provincialId = caller.agencyId
    } else {
      return []
    }
    const rows = await this.prisma.costInquiry.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map((r) => ({
      id: r.id,
      routeId: r.routeId,
      provincialId: r.provincialId,
      token: r.token,
      status: r.status,
      cost1: r.cost1 != null ? Number(r.cost1) : null,
      costItems: (r.costItems as { name: string; amount: number }[] | undefined) ?? [],
      createdAt: r.createdAt.toISOString(),
    }))
  }

  // 一手将询价成本①写入路线报价（按项目合并，并重新计算合计）
  // 核心：省地接社反馈的 costItems 不是只写入 totals.cost1，而是写入 quote.items，
  // 让报价表（按项目展示）和成本询价明细保持一致。
  async applyToRoute(inquiryId: string, caller: AuthPrincipal) {
    if (caller.role !== 'pandaking') {
      throw new ForbiddenException('仅一手 PandaKing 可应用成本询价')
    }
    const ci = await this.prisma.costInquiry.findUniqueOrThrow({ where: { id: inquiryId } })
    const rawCostItems = (ci.costItems as { name?: string; amount?: number }[] | undefined) ?? []
    const hasCostItems = rawCostItems.length > 0
    if (ci.cost1 == null && !hasCostItems) {
      throw new BadRequestException('该询价尚未提交成本①')
    }

    // 找最新版本（不再限定 draft=false），确保前端正在编辑的版本能立即看到回填
    const latest = await this.prisma.routeVersion.findFirst({
      where: { routeId: ci.routeId },
      orderBy: { createdAt: 'desc' },
    })
    if (!latest) throw new BadRequestException('该路线暂无版本，无法写入成本①')

    const q = (latest.quote as { items?: any[]; totals?: Record<string, number> }) || {
      items: [],
      totals: {},
    }
    const items: any[] = Array.isArray(q.items) ? JSON.parse(JSON.stringify(q.items)) : []

    // 准备省地接社成本项：优先用 costItems；兼容旧数据只有 cost1 的情况
    const costItems = rawCostItems.map((it) => ({
      name: String(it.name || '').trim() || '未命名',
      amount: Math.max(0, Number(it.amount) || 0),
    }))
    if (costItems.length === 0 && ci.cost1 != null) {
      costItems.push({ name: '省地接社成本①', amount: Number(ci.cost1) })
    }

    // 合并：同名项目更新 cost1（省地接社只回填成本①，利润1 归零），
    // 否则追加新项目（cost1=amount，profit1=0）。保留原行的 name/type。
    for (const { name, amount } of costItems) {
      if (!amount) continue
      const existing = items.find((it) => String(it.name || '').trim() === name)
      if (existing) {
        existing.cost1 = amount
        existing.profit1Mode = 'amount'
        existing.profit1 = 0
      } else {
        items.push({
          name,
          type: 'other',
          cost1: amount,
          profit1Mode: 'amount',
          profit1: 0,
        })
      }
    }

    // 从 items 重算 totals（cost1/profit1/quoteA/profit2/guestPrice 永远一致），
    // 保留上一次旅行社利润2 设置（applyToRoute 只动省地接社成本①）
    const prevTotals = (q.totals || {}) as Record<string, number | string>
    const newQuote: { items: any[]; totals: Record<string, unknown> } = {
      items,
      totals: { ...prevTotals },
    }
    const recalced = recalcQuote(newQuote) as {
      items: any[]
      totals: { cost1?: number; profit1?: number; quoteA?: number; guestPrice?: number }
    }
    await this.prisma.routeVersion.update({
      where: { id: latest.id },
      data: { quote: recalced as object },
    })

    return {
      ok: true,
      routeId: ci.routeId,
      versionId: latest.id,
      cost1: recalced.totals?.cost1 ?? 0,
      costItems,
    }
  }
}
