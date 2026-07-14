import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CostInquiryService } from './cost-inquiry.service'
import type { AuthPrincipal, Role, RoleLevel } from '../auth/auth.service'

interface AuthUser {
  id: string
  role: Role
  agencyId: string | null
  level: RoleLevel
}

// 成本询价（一手 ↔ 省地接社）—— 对应 doc/04-接口契约/H5协作链接.md
@Controller('cost-inquiries')
@UseGuards(JwtAuthGuard)
export class CostInquiryController {
  constructor(private readonly svc: CostInquiryService) {}

  // 列表（按权限隔离）：一手全部；省地接社仅本机构；旅行社不可见
  @Get()
  list(@Query('routeId') routeId: string, @CurrentUser() user: AuthUser) {
    return this.svc.list(routeId || undefined, user as AuthPrincipal)
  }

  // 一手将询价成本①写入路线报价
  @Post(':id/apply')
  apply(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.applyToRoute(id, user as AuthPrincipal)
  }
}
