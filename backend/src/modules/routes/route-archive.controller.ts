import { Controller, Get, Param, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RouteArchiveService } from './route-archive.service'
import { Role } from './role-visibility'

interface AuthUser {
  id: string
  role: Role
  agencyId: string | null
  level: 'admin' | 'staff'
}

// 路线归档历史：查看一手已删除路线的备份快照
@Controller('route-archives')
@UseGuards(JwtAuthGuard)
export class RouteArchiveController {
  constructor(private readonly svc: RouteArchiveService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.svc.findAll(user.role)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.findOne(id, user.role)
  }
}
