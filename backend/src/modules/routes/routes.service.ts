import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(status?: string) {
    return this.prisma.route.findMany({
      where: status ? { statusKey: status } : undefined,
      include: { versions: true },
      orderBy: { updatedAt: 'desc' },
    })
  }

  findOne(id: string) {
    return this.prisma.route.findUniqueOrThrow({
      where: { id },
      include: { versions: true },
    })
  }

  create(body: any) {
    return this.prisma.route.create({
      data: {
        customerName: body.customerName,
        customerNameCn: body.customerNameCn,
        country: body.country,
        agency: body.agency,
        destination: body.destination,
        groupSize: body.groupSize ?? 1,
        travelDate: body.travelDate ? new Date(body.travelDate) : null,
        statusKey: body.statusKey ?? 'awaiting_pk_confirm',
        modeKey: body.modeKey ?? 'collab',
        createdById: body.createdById ?? 'seed',
      },
    })
  }

  // 生成新版本（行程+报价一体化）
  saveVersion(id: string, body: any) {
    return this.prisma.routeVersion.create({
      data: {
        routeId: id,
        version: body.version ?? 'v1',
        draft: body.draft ?? false,
        itinerary: body.itinerary ?? {},
        quote: body.quote ?? null,
      },
    })
  }
}
