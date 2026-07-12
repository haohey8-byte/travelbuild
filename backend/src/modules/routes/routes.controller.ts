import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RoutesService } from './routes.service'
import { Role } from './role-visibility'

interface AuthUser {
  id: string
  role: Role
}

// 路线与版本 —— 对应 doc/04-接口契约/路线与版本.md
// 所有写操作均经 JwtAuthGuard（当前 dev 放行并注入默认用户），并按角色做字段级可见性。
@Controller('routes')
@UseGuards(JwtAuthGuard)
export class RoutesController {
  constructor(private readonly svc: RoutesService) {}

  @Get()
  findAll(@Query('status') status: string, @CurrentUser() user: AuthUser) {
    return this.svc.findAll(status, user.role)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.findOne(id, user.role)
  }

  @Post()
  create(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.svc.create({ ...body, createdById: user.id })
  }

  @Get(':id/versions')
  getVersions(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.getVersions(id, user.role)
  }

  @Get(':id/versions/:vid')
  getVersion(
    @Param('id') id: string,
    @Param('vid') vid: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.getVersion(id, vid, user.role)
  }

  // 保存并通知：生成新 version（draft=false 且 notify=true 时返回对外 H5 链接）
  @Post(':id/versions')
  saveVersion(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.saveVersion(id, body, user.role)
  }

  // 旅行社提交草案 → 待一手确认
  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.submitDraft(id, user.role)
  }

  // 一手确认采用 → 待报价
  @Post(':id/confirm')
  pkConfirm(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.pkConfirm(id, user.role)
  }

  // 一手回传修改反馈 → 待旅行社修订
  @Post(':id/feedback')
  pkFeedback(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.pkFeedback(id, body?.feedback, user.role)
  }

  // 旅行社修订重交 → 待一手确认
  @Post(':id/revise')
  revise(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.reviseByAgency(id, user.role)
  }

  // 一手发报价 v1 → 待反馈
  @Post(':id/send-v1')
  sendV1(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.sendV1(id, user.role)
  }

  // 旅行社加价 → 待确认
  @Post(':id/markup')
  markup(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.agencyMarkup(id, user.role)
  }

  // 游客确认 → 已确认
  @Post(':id/tourist-confirm')
  touristConfirm(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.touristConfirm(id, user.role)
  }

  // 付款 → 已成单
  @Post(':id/pay')
  pay(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.pay(id, user.role)
  }

  // 拒绝 → 已流失
  @Post(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.reject(id, user.role)
  }
}
