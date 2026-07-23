import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ShareTokenGuard } from '../../common/guards/share-token.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RoutesService } from './routes.service'
import { Role } from './role-visibility'

interface AuthUser {
  id: string
  role: Role
  agencyId: string | null
  level: 'admin' | 'staff'
}

// 机构提交链接（route-intake）：免登录提交，仅 PandaKing 可预发链接。
// 独立于 RoutesController（后者类级挂 JwtAuthGuard），避免提交端点被强制走登录态。
@Controller('routes')
export class IntakeController {
  constructor(private readonly svc: RoutesService) {}

  // 预发机构提交链接（仅一手 PandaKing）：钉死 agencyId，返回 token + H5 链接
  @Post('intake-link')
  @UseGuards(JwtAuthGuard)
  createIntakeLink(
    @Body() body: { agencyId: string },
    @CurrentUser() user: AuthUser,
  ) {
    if (user.role !== 'pandaking') {
      throw new ForbiddenException('仅一手 PandaKing 可预发机构提交链接')
    }
    return this.svc.createIntakeLink(body.agencyId, user.id)
  }

  // 机构凭链接免登录提交路线初稿（ShareTokenGuard 校验提交令牌 + 过期）
  @Post('intake')
  @UseGuards(ShareTokenGuard)
  submitIntake(@Body() body: any) {
    return this.svc.submitIntake(body)
  }

  // 已生成链接列表（PandaKing 控制台「复制历史」管理）
  @Get('intake-links')
  @UseGuards(JwtAuthGuard)
  listIntakeLinks(@CurrentUser() user: AuthUser) {
    if (user.role !== 'pandaking') {
      throw new ForbiddenException('仅一手 PandaKing 可查看提交链接')
    }
    return this.svc.listIntakeLinks()
  }

  // 复制计数（复制历史）：自增 copies + 写最近复制时间
  @Post('intake-link/:token/copy')
  @UseGuards(JwtAuthGuard)
  markCopied(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    if (user.role !== 'pandaking') {
      throw new ForbiddenException('仅一手 PandaKing 可操作')
    }
    return this.svc.markCopied(token)
  }
}
