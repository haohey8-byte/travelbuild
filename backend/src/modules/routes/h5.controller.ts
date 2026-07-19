import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { RoutesService } from './routes.service'
import { CostInquiryService } from './cost-inquiry.service'

// 协作 H5（公开，免登录） —— 对应 doc/04-接口契约/H5协作链接.md
// 客户/对方凭共享令牌只读查看行程与对客报价，并可提交反馈，完成协作闭环。
@Controller('h5')
export class H5Controller {
  constructor(
    private readonly svc: RoutesService,
    private readonly costInquiry: CostInquiryService,
  ) {}

  // 渲染协作 H5（按 token 解析路线+version，报价仅暴露对客总价）
  @Get('route/:token')
  getRoute(@Param('token') token: string) {
    return this.svc.getH5(token)
  }

  // 提交协作反馈（客户/对方修改意见）
  @Post('route/:token/feedback')
  feedback(
    @Param('token') token: string,
    @Body() body: { content: string; authorName?: string },
  ) {
    return this.svc.submitFeedback(token, body?.content, body?.authorName)
  }

  // 读取协作反馈（公开，免登录）—— H5 页展示历史反馈，形成闭环
  @Get('route/:token/feedback')
  getFeedback(@Param('token') token: string) {
    return this.svc.getFeedbackByToken(token)
  }

  // 成本询价 H5（省地接社填成本价①）—— 免登录，链接即授权
  @Get('cost-inquiry/:token')
  getCostInquiry(@Param('token') token: string) {
    return this.costInquiry.getByToken(token)
  }

  // 省地接社提交成本①
  @Post('cost-inquiry/:token/submit')
  submitCostInquiry(
    @Param('token') token: string,
    @Body() body: { cost1: number },
  ) {
    return this.costInquiry.submit(token, body?.cost1)
  }

  // 省地接社协作 H5：保存编辑后的行程并提交成本①（可单独或一起提交）
  // 成本①支持按项目填写：{ name: string, amount: number }[]，系统自动合计
  @Post('route/:token/edit')
  editRoute(
    @Param('token') token: string,
    @Body() body: { itinerary?: unknown; items?: { name?: string; cost1?: number; profit1Mode?: string; profit1?: number; type?: string }[] },
  ) {
    return this.svc.provincialEdit(token, body)
  }

  // 旅行社协作 H5：凭 token 保存加价（利润②），免登录鉴权（与省地接社 edit 一致）。
  // 不再走控制台 /routes/:id/versions（会误报「路线不存在」）。
  @Post('route/:token/quote')
  agencyQuote(
    @Param('token') token: string,
    @Body() body: { profit2Mode?: 'amount' | 'percent'; profit2?: number },
  ) {
    return this.svc.agencyQuote(token, body)
  }

  // 一手 PandaKing 协作 H5：凭 pandaking 令牌全量编辑行程 + 价格（成本① + 利润① + 利润②），
  // 免登录鉴权，提交后生成新版本并同步对端(agency)令牌指向新版，支撑 PandaKing↔旅行社 反复往返。
  @Post('route/:token/pandaking-edit')
  pandakingEdit(
    @Param('token') token: string,
    @Body() body: { itinerary?: unknown; quote?: unknown },
  ) {
    return this.svc.pandakingEdit(token, body)
  }

  // 境外旅行社协作 H5：凭 agency 令牌编辑行程 + 利润②（成本①不可见/不可改），
  // 免登录鉴权，提交后生成新版本并同步对端(pandaking)令牌指向新版。
  @Post('route/:token/agency-edit')
  agencyEdit(
    @Param('token') token: string,
    @Body() body: { itinerary?: unknown; profit2Mode?: 'amount' | 'percent'; profit2?: number },
  ) {
    return this.svc.agencyEdit(token, body)
  }
}
