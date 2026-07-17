import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { Role } from './role-visibility'

// 路线归档历史查看服务：仅一手 PandaKing 可查看已删除路线的备份快照
@Injectable()
export class RouteArchiveService {
  constructor(private readonly prisma: PrismaService) {}

  private assertPandaking(role: Role) {
    if (role !== 'pandaking') {
      throw new ForbiddenException('仅一手 PandaKing 可查看路线归档')
    }
  }

  async findAll(role: Role) {
    this.assertPandaking(role)
    const rows = await this.prisma.routeArchive.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        routeId: true,
        deletedById: true,
        deletedByName: true,
        reason: true,
        createdAt: true,
      },
    })
    return rows.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
    }))
  }

  async findOne(id: string, role: Role) {
    this.assertPandaking(role)
    const row = await this.prisma.routeArchive.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('归档记录不存在')
    return {
      ...row,
      routeData: row.routeData as object,
      versions: (row.versions ?? []) as object,
      shares: (row.shares ?? []) as object,
      feedbacks: (row.feedbacks ?? []) as object,
      costInquiries: (row.costInquiries ?? []) as object,
      createdAt: row.createdAt.toISOString(),
    }
  }
}
