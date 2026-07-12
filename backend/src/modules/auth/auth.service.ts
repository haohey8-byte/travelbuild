import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../../prisma/prisma.service'

export type Role = 'pandaking' | 'agency' | 'provincial'

export interface AuthUserView {
  id: string
  name: string
  role: Role
  agencyId: string | null
  email: string | null
  disabled: boolean
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** 签发 JWT：payload 携带 sub/role/name，守卫据此注入 req.user */
  private signToken(user: { id: string; role: Role; name?: string }) {
    return this.jwt.signAsync({ sub: user.id, role: user.role, name: user.name })
  }

  // 微信网页授权 URL（待接微信；MVP 返回占位，参数来自 WX_APPID/H5_BASE_URL）
  buildWechatAuthUrl() {
    const appid = process.env.WECHAT_APPID || '<WECHAT_APPID>'
    const cb = `${process.env.H5_BASE_URL || 'https://example.com'}/api/auth/wechat/callback`
    return {
      url: `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${appid}&redirect_uri=${encodeURIComponent(
        cb,
      )}&response_type=code&scope=snsapi_userinfo#wechat_redirect`,
    }
  }

  // 微信 code 换 token（MVP：未配 WX_SECRET 时回退到一手演示账号；正式环境用 code 换 openid 再查/建用户）
  async exchangeCode(code: string) {
    if (!code) throw new UnauthorizedException('缺少 code')
    if (!process.env.WECHAT_SECRET) {
      const demo = await this.prisma.user.findFirst({
        where: { role: 'pandaking', disabled: false },
      })
      if (!demo) throw new UnauthorizedException('无可用演示账号，请先执行 seed')
      return { token: await this.signToken(demo), user: this.toUserView(demo) }
    }
    // TODO: 真实环境——用 code 调微信 sns/oauth2/access_token 取 openid，再按 openid 查/建用户
    throw new Error('微信真实换 token 待接入：需 WX_SECRET 与 openid 绑定逻辑')
  }

  // 一手发起邀请（带角色+7天有效期）
  async createInvite(body: { email?: string; role: Role }, createdById: string) {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36)
    return this.prisma.invite.create({
      data: {
        token,
        role: body.role,
        email: body.email,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        createdById,
      },
    })
  }

  async getInvite(token: string) {
    return this.prisma.invite.findUniqueOrThrow({ where: { token } })
  }

  // 接受邀请 → 创建账号并签发 JWT（校验未使用/未过期）
  async acceptInvite(input: { token: string; name: string; openid?: string }) {
    const invite = await this.prisma.invite.findUnique({ where: { token: input.token } })
    if (!invite) throw new NotFoundException('邀请无效')
    if (invite.accepted) throw new ConflictException('邀请已使用')
    if (invite.expiresAt.getTime() < Date.now()) throw new ConflictException('邀请已过期')
    const user = await this.prisma.user.create({
      data: {
        name: input.name,
        role: invite.role,
        agencyId: null,
        openid: input.openid ?? null,
      },
    })
    await this.prisma.invite.update({ where: { id: invite.id }, data: { accepted: true } })
    return { token: await this.signToken(user), user: this.toUserView(user) }
  }

  async loginByOpenid(openid: string) {
    const user = await this.prisma.user.findUnique({ where: { openid } })
    if (!user || user.disabled) throw new UnauthorizedException('账号不可用')
    return { token: await this.signToken(user), user: this.toUserView(user) }
  }

  // 开发登录：按角色取首个启用账号（仅 DEV_BYPASS_AUTH=true 或非 production 可用）
  async devLogin(role: Role) {
    if (process.env.DEV_BYPASS_AUTH !== 'true' && process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('生产环境禁用 dev-login')
    }
    const user = await this.prisma.user.findFirst({ where: { role, disabled: false } })
    if (!user) throw new NotFoundException(`无 ${role} 演示账号，请先执行 seed`)
    return { token: await this.signToken(user), user: this.toUserView(user) }
  }

  async me(userId: string) {
    if (userId === 'dev') return { id: 'dev', name: 'dev', role: 'pandaking' as Role }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } })
    return this.toUserView(user)
  }

  listMembers() {
    return this.prisma.user.findMany({ where: { disabled: false } })
  }

  private toUserView(u: {
    id: string
    name: string
    role: Role
    agencyId: string | null
    email: string | null
    disabled: boolean
  }): AuthUserView {
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      agencyId: u.agencyId,
      email: u.email,
      disabled: u.disabled,
    }
  }
}
