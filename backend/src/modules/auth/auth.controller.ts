import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthService, Role } from './auth.service'

interface AuthUser {
  id: string
  role: Role
}

// 账号与认证 —— 对应 doc/04-接口契约/账号与认证.md
@Controller('auth')
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  // 微信网页授权发起（占位，待接微信）
  @Get('wechat')
  wechatAuth() {
    return this.svc.buildWechatAuthUrl()
  }

  // 微信回调换 token（MVP 回退演示账号）
  @Post('wechat/callback')
  wechatCallback(@Body() body: { code: string }) {
    return this.svc.exchangeCode(body.code)
  }

  // 一手创建邀请（需登录）
  @Post('invites')
  @UseGuards(JwtAuthGuard)
  createInvite(@Body() body: { email?: string; role: Role }, @CurrentUser() user: AuthUser) {
    return this.svc.createInvite(body, user.id)
  }

  @Get('invites/:token')
  getInvite(@Param('token') token: string) {
    return this.svc.getInvite(token)
  }

  // 接受邀请 → 创建账号并签发 JWT
  @Post('accept-invite')
  acceptInvite(@Body() body: { token: string; name: string; openid?: string }) {
    return this.svc.acceptInvite(body)
  }

  // 开发登录：按角色取演示账号（DEV_BYPASS_AUTH=true 或非生产可用）
  @Post('dev-login')
  devLogin(@Body() body: { role: Role }) {
    return this.svc.devLogin(body.role)
  }

  // 当前登录用户（需登录）
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.svc.me(user.id)
  }

  // 成员列表（需登录）
  @Get('members')
  @UseGuards(JwtAuthGuard)
  listMembers() {
    return this.svc.listMembers()
  }
}
