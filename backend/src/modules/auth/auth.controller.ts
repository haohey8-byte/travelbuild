import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { AuthService, AuthPrincipal, Role, RoleLevel } from './auth.service'

interface AuthUser {
  id: string
  role: Role
  agencyId: string | null
  level: RoleLevel
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

  // 创建邀请（两层级：一手邀请机构管理员 → 管理员/一手邀请机构员工）
  @Post('invites')
  @UseGuards(JwtAuthGuard)
  createInvite(
    @Body() body: { role: Role; email?: string; agencyId?: string; level?: RoleLevel },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.createInvite(body, user as AuthPrincipal)
  }

  // 邀请列表（按权限隔离）
  @Get('invites')
  @UseGuards(JwtAuthGuard)
  listInvites(@CurrentUser() user: AuthUser) {
    return this.svc.listInvites(user as AuthPrincipal)
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

  // 成员列表（按机构物理隔绝）
  @Get('members')
  @UseGuards(JwtAuthGuard)
  listMembers(@CurrentUser() user: AuthUser) {
    return this.svc.listMembers(user as AuthPrincipal)
  }

  // 权限矩阵（字段级 + 物理隔绝）
  @Get('permissions/matrix')
  @UseGuards(JwtAuthGuard)
  permissionMatrix() {
    return this.svc.getPermissionMatrix()
  }

  // 改成员角色（仅一手）
  @Put('members/:id/role')
  @UseGuards(JwtAuthGuard)
  updateMemberRole(
    @Param('id') id: string,
    @Body() body: { role: Role },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.updateMemberRole(id, body.role, user as AuthPrincipal)
  }

  // 停用成员（仅一手）
  @Post('members/:id/disable')
  @UseGuards(JwtAuthGuard)
  disableMember(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.disableMember(id, user as AuthPrincipal)
  }
}
