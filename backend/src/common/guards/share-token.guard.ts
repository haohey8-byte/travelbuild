import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

// 机构提交链接（route-intake）守卫：仅用于 intake 提交端点，免登录。
// 校验请求体 / 头 / query 中的提交令牌（RouteIntake.token），存在且未过期则放行，
// 并把 { agencyId, intakeId, createdById } 挂到 req.intake，供控制器/服务使用。
// 原有的 h5.controller 走各自 service 内部令牌校验，不受本守卫影响（无回归）。
@Injectable()
export class ShareTokenGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    const token: string | undefined =
      req.body?.token || req.headers['x-intake-token'] || req.query?.token
    if (!token) {
      throw new UnauthorizedException({ code: 'AUTH_INVALID_TOKEN', message: '缺少提交凭证' })
    }
    const intake = await this.prisma.routeIntake.findUnique({ where: { token } })
    if (!intake) {
      throw new NotFoundException({ code: 'INTAKE_INVALID', message: '提交链接无效' })
    }
    // expiresAt 为 null = 永久有效，直接放行；否则校验绝对过期时间
    if (intake.expiresAt && intake.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException({ code: 'INTAKE_EXPIRED', message: '提交链接已过期' })
    }
    req.intake = {
      agencyId: intake.agencyId,
      intakeId: intake.id,
      createdById: intake.createdById,
    }
    return true
  }
}
