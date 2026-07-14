import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RoutesService } from './routes.service'
import { CostInquiryService } from './cost-inquiry.service'
import { Role } from './role-visibility'

interface AuthUser {
  id: string
  role: Role
  agencyId: string | null
  level: 'admin' | 'staff'
}

// 路线与版本 —— 对应 doc/04-接口契约/路线与版本.md
// 所有写操作均经 JwtAuthGuard（当前 dev 放行并注入默认用户），并按角色做字段级可见性。
@Controller('routes')
@UseGuards(JwtAuthGuard)
export class RoutesController {
  constructor(
    private readonly svc: RoutesService,
    private readonly costInquiry: CostInquiryService,
  ) {}

  @Get()
  findAll(@Query('status') status: string, @CurrentUser() user: AuthUser) {
    return this.svc.findAll(status, user)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.findOne(id, user)
  }

  @Post()
  create(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.svc.create({
      ...body,
      createdById: user.id,
      creatorRole: user.role,
      creatorAgencyId: user.agencyId,
    })
  }

  @Get(':id/versions')
  getVersions(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.getVersions(id, user)
  }

  // 反馈记录（H5 链接反馈 + 一手回传反馈），供协作双方查看
  @Get(':id/feedback')
  getFeedback(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.getFeedback(id, user)
  }

  @Get(':id/versions/:vid')
  getVersion(
    @Param('id') id: string,
    @Param('vid') vid: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.getVersion(id, vid, user)
  }

  // 保存并通知：生成新 version（draft=false 且 notify=true 时返回对外 H5 链接）
  @Post(':id/versions')
  saveVersion(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.saveVersion(id, body, user)
  }

  // 生成协作 H5 共享令牌 + 链接（含当前对外版本）
  @Post(':id/share')
  share(
    @Param('id') id: string,
    @Body() body: { role?: Role },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.createShare(id, body?.role ?? user.role)
  }

  // 旅行社提交草案 → 待一手确认
  @Post(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.submitDraft(id, user)
  }

  // 一手确认采用 → 待报价
  @Post(':id/confirm')
  pkConfirm(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.pkConfirm(id, user)
  }

  // 一手回传修改反馈 → 待旅行社修订
  @Post(':id/feedback')
  pkFeedback(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.pkFeedback(id, body?.feedback, user)
  }

  // 旅行社修订重交 → 待一手确认
  @Post(':id/revise')
  revise(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.reviseByAgency(id, user)
  }

  // 一手发报价 v1 → 待反馈
  @Post(':id/send-v1')
  sendV1(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.sendV1(id, user)
  }

  // 一手向省地接社发起成本询价（指定省地接社机构编号）→ 返回 H5 链接
  @Post(':id/cost-inquiry')
  createCostInquiry(
    @Param('id') id: string,
    @Body() body: { provincialId: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.costInquiry.create(id, body?.provincialId, user as any)
  }

  // 一手将某路线分配给省地接社（分配后该省地接社可见并参与协作）
  @Post(':id/assign-provincial')
  assignProvincial(
    @Param('id') id: string,
    @Body() body: { provincialId: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.assignProvincial(id, body?.provincialId, user as any)
  }

  // 一手生成「省地接社协作 H5」（可编辑行程）链接，复制发微信群给省地接社
  @Post(':id/provincial-share')
  createProvincialShare(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.createProvincialShare(id, user as any)
  }

  // 旅行社加价 → 待确认
  @Post(':id/markup')
  markup(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.agencyMarkup(id, user)
  }

  // 游客确认 → 已确认
  @Post(':id/tourist-confirm')
  touristConfirm(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.touristConfirm(id, user)
  }

  // 付款 → 已成单
  @Post(':id/pay')
  pay(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.pay(id, user)
  }

  // 拒绝 → 已流失
  @Post(':id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.reject(id, user)
  }
}
