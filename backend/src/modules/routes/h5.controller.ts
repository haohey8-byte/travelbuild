import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { RoutesService } from './routes.service'

// 协作 H5（公开，免登录） —— 对应 doc/04-接口契约/H5协作链接.md
// 客户/对方凭共享令牌只读查看行程与对客报价，并可提交反馈，完成协作闭环。
@Controller('h5')
export class H5Controller {
  constructor(private readonly svc: RoutesService) {}

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
}
