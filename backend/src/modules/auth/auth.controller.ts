import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { AuthService } from './auth.service'

// 账号与认证 —— 对应 doc/04-接口契约/账号与认证.md
@Controller('auth')
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  // 微信 OAuth2 发起（占位，待接微信）
  @Get('wechat')
  wechatAuth() {
    return this.svc.buildWechatAuthUrl()
  }

  // 微信回调换 token（占位）
  @Post('wechat/callback')
  wechatCallback(@Body() body: { code: string }) {
    return this.svc.exchangeCode(body.code)
  }

  // 一手创建邀请
  @Post('invites')
  createInvite(@Body() body: { email?: string; role: string }) {
    return this.svc.createInvite(body)
  }

  @Get('invites/:token')
  getInvite(@Param('token') token: string) {
    return this.svc.getInvite(token)
  }

  @Get('members')
  listMembers() {
    return this.svc.listMembers()
  }
}
