import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CaseService } from './case.service'

interface AuthUser {
  id: string
}

// 案例展示（脱敏） —— 对应 doc/04-接口契约/案例.md 与 PRD 4.8.6
// 公开只读已发布案例；管理（建/改/发布/下线/删）需登录
@Controller('cases')
export class CaseController {
  constructor(private readonly svc: CaseService) {}

  // 公开：已发布案例列表（案例展示页）
  @Get()
  listPublic() {
    return this.svc.listPublished()
  }

  // 公开：已发布案例详情
  @Get(':id')
  getPublic(@Param('id') id: string) {
    return this.svc.getPublished(id)
  }

  // 管理：全量（含草稿/下线）
  @Get('manage/all')
  @UseGuards(JwtAuthGuard)
  listAll() {
    return this.svc.listAll()
  }

  // 管理：新建案例
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.svc.create({ ...body, createdById: user.id })
  }

  // 管理：由已确认路线派生脱敏草稿
  @Post('from-route/:routeId')
  @UseGuards(JwtAuthGuard)
  fromRoute(@Param('routeId') routeId: string, @CurrentUser() user: AuthUser) {
    return this.svc.publishFromRoute(routeId, user.id)
  }

  // 管理：发布
  @Post(':id/publish')
  @UseGuards(JwtAuthGuard)
  publish(@Param('id') id: string) {
    return this.svc.publish(id)
  }

  // 管理：下线
  @Post(':id/unpublish')
  @UseGuards(JwtAuthGuard)
  unpublish(@Param('id') id: string) {
    return this.svc.unpublish(id)
  }

  // 管理：编辑
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.update(id, body)
  }

  // 管理：删除
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }
}
