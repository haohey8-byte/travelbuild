import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

export interface KbListQuery {
  category?: string
  tag?: string
  q?: string
}

export interface CreateKbInput {
  title: string
  category: string
  tags?: string[]
  body: string
  routeId?: string
  createdById: string
}

export interface UpdateKbInput {
  title?: string
  category?: string
  tags?: string[]
  body?: string
}

@Injectable()
export class KbService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: KbListQuery = {}) {
    const where: Record<string, unknown> = {}
    if (query.category) where.category = query.category
    if (query.tag) where.tags = { has: query.tag }
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { body: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    return this.prisma.kbEntry.findMany({ where, orderBy: { updatedAt: 'desc' } })
  }

  async getById(id: string) {
    const e = await this.prisma.kbEntry.findUnique({ where: { id } })
    if (!e) throw new NotFoundException('知识条目不存在')
    return e
  }

  create(input: CreateKbInput) {
    return this.prisma.kbEntry.create({ data: { ...input, tags: input.tags ?? [] } })
  }

  async update(id: string, input: UpdateKbInput) {
    await this.getById(id)
    return this.prisma.kbEntry.update({ where: { id }, data: input })
  }

  async remove(id: string) {
    await this.getById(id)
    return this.prisma.kbEntry.delete({ where: { id } })
  }
}
