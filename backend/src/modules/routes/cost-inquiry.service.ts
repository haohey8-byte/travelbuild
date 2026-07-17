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
    return {
      token: ci.token,
      status: ci.status,
      cost1: ci.cost1 != null ? Number(ci.cost1) : null,
      costItems: (ci.costItems as { name: string; amount: number }[] | undefined) ?? [],
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

  // 一手将询价成本①写入路线报价（更新最新正式版本的 totals.cost1 并重算对客总价）
  async applyToRoute(inquiryId: string, caller: AuthPrincipal) {
    if (caller.role !== 'pandaking') {
      throw new ForbiddenException('仅一手 PandaKing 可应用成本询价')
    }
    const ci = await this.prisma.costInquiry.findUniqueOrThrow({ where: { id: inquiryId } })
    if (ci.cost1 == null) throw new BadRequestException('该询价尚未提交成本①')
    const latest = await this.prisma.routeVersion.findFirst({
      where: { routeId: ci.routeId, draft: false },
      orderBy: { createdAt: 'desc' },
    })
    if (!latest) throw new BadRequestException('该路线暂无正式版本，无法写入成本①（请先保存非草稿版本）')
    const q = (latest.quote as { items?: unknown[]; totals?: Record<string, number> }) || {
      items: [],
      totals: {},
    }
    const totals = { ...(q.totals || {}) }
    const cost1 = Number(ci.cost1)
    totals.cost1 = cost1
    totals.guestPrice =
      (Number(totals.cost1) || 0) + (Number(totals.cost2) || 0) + (Number(totals.markup) || 0)
    const newQuote = { ...q, totals }
    await this.prisma.routeVersion.update({
      where: { id: latest.id },
      data: { quote: newQuote as object },
    })
    return { ok: true, routeId: ci.routeId, cost1 }
  }
}
