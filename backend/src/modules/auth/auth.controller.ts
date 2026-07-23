import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common'
import { Request } from 'express'
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

  private clientIp(req: Request): string {
    const xff = req.headers['x-forwarded-for']
    if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim()
    return req.ip || 'unknown'
  }

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

  // 手机号 + 密码登录（管理员）
  @Post('login')
  login(@Body() body: { phone: string; password: string }, @Req() req: Request) {
    return this.svc.login(body.phone, body.password, this.clientIp(req))
  }

  // 改密（含首次强制改密，需登录态）
  @Post('change-pwd')
  @UseGuards(JwtAuthGuard)
  changePwd(@Body() body: { oldPwd: string; newPwd: string }, @CurrentUser() user: AuthUser) {
    return this.svc.changePwd(user.id, body.oldPwd, body.newPwd)
  }

  // 管理员列表（手机号脱敏）
  @Get('admins')
  @UseGuards(JwtAuthGuard)
  listAdmins(@CurrentUser() user: AuthUser) {
    return this.svc.listAdmins()
  }

  // 新增管理员
  @Post('admins')
  @UseGuards(JwtAuthGuard)
  createAdmin(@Body() body: { name: string; phone: string; initPwd: string }, @CurrentUser() user: AuthUser) {
    return this.svc.createAdmin(body, user as AuthPrincipal)
  }

  // 重置管理员密码
  @Post('admins/:id/reset-pwd')
  @UseGuards(JwtAuthGuard)
  resetAdminPwd(@Param('id') id: string, @Body() body: { initPwd: string }, @CurrentUser() user: AuthUser) {
    return this.svc.resetAdminPwd(id, body.initPwd, user as AuthPrincipal)
  }

  // 禁用管理员
  @Post('admins/:id/disable')
  @UseGuards(JwtAuthGuard)
  disableAdmin(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.disableAdmin(id, user as AuthPrincipal)
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

  // 机构管理（Agency）：替换裸 agencyId，支持真实机构档案
  // D1/D4：建机构时一并建该机构控制台登录账号（需 phone；initPwd 可选，不传则后端生成并一次性返回）
  @Post('agencies')
  @UseGuards(JwtAuthGuard)
  createAgency(
    @Body() body: { id?: string; name: string; role: Role; contact?: string; phone: string; initPwd?: string },
    @CurrentUser() user: AuthUser,
  ) {
    return this.svc.createAgency(body, user as AuthPrincipal)
  }

  // 删除机构：硬删 + 前置校验（仅一手）
  @Delete('agencies/:id')
  @UseGuards(JwtAuthGuard)
  deleteAgency(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.deleteAgency(id, user as AuthPrincipal)
  }

  @Get('agencies')
  @UseGuards(JwtAuthGuard)
  listAgencies(@CurrentUser() user: AuthUser) {
    return this.svc.listAgencies(user as AuthPrincipal)
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
