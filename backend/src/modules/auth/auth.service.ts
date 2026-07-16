import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../../prisma/prisma.service'

export type Role = 'pandaking' | 'agency' | 'provincial'
export type RoleLevel = 'admin' | 'staff'

// 当前登录主体：注入 req.user，并写入 JWT 载荷
export interface AuthPrincipal {
  id: string
  role: Role
  agencyId: string | null
  level: RoleLevel
}

export interface AuthUserView {
  id: string
  name: string
  role: Role
  agencyId: string | null
  level: RoleLevel
  parentId: string | null
  email: string | null
  disabled: boolean
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** 签发 JWT：payload 携带 sub/role/name/agencyId/level，守卫据此注入 req.user */
  private signToken(user: {
    id: string
    role: Role
    name?: string
    agencyId?: string | null
    level?: RoleLevel
  }) {
    return this.jwt.signAsync({
      sub: user.id,
      role: user.role,
      name: user.name,
      agencyId: user.agencyId ?? null,
      level: user.level ?? 'staff',
    })
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

  // 创建邀请（两层级邀请模型）
  // - 一手 PandaKing 可邀请任意机构的 admin，以及任意机构的 staff
  // - 机构 admin 仅可邀请「本机构」的 staff
  // 物理隔绝：agencyId 锁定受邀者归属机构；staff 邀请强制继承邀请人的 agencyId
  async createInvite(
    body: {
      role: Role
      email?: string
      agencyId?: string
      level?: RoleLevel
      parentId?: string
    },
    inviter: AuthPrincipal,
  ) {
    const level: RoleLevel =
      body.level ?? (inviter.role === 'pandaking' ? 'admin' : 'staff')

    // 一手互邀（枢纽内部）
    if (body.role === 'pandaking') {
      if (inviter.role !== 'pandaking') {
        throw new UnauthorizedException('仅一手 PandaKing 可邀请一手账号')
      }
      return this.prisma.invite.create({
        data: {
          token: this.genToken(),
          role: 'pandaking',
          agencyId: null,
          level: 'admin',
          parentId: inviter.id,
          email: body.email,
          expiresAt: this.expiry(),
          createdById: inviter.id,
        },
      })
    }

    // 机构（境外旅行社 / 省地接社）邀请：必须指定归属机构
    if (!body.agencyId) {
      throw new BadRequestException('机构邀请必须指定 agencyId（机构编号）')
    }

    if (level === 'admin') {
      // 仅一手可邀请机构管理员
      if (inviter.role !== 'pandaking') {
        throw new UnauthorizedException('仅一手 PandaKing 可邀请机构管理员')
      }
    } else {
      // staff：邀请人须为「一手」或「本机构 admin」（强制同机构，物理隔绝）
      const sameOrg = inviter.agencyId === body.agencyId
      const isOrgAdmin =
        inviter.role === body.role && inviter.level === 'admin' && sameOrg
      if (inviter.role !== 'pandaking' && !isOrgAdmin) {
        throw new UnauthorizedException('仅一手或本机构管理员可邀请员工')
      }
    }

    return this.prisma.invite.create({
      data: {
        token: this.genToken(),
        role: body.role,
        agencyId: body.agencyId,
        level,
        parentId: inviter.id,
        email: body.email,
        expiresAt: this.expiry(),
        createdById: inviter.id,
      },
    })
  }

  async getInvite(token: string) {
    const invite = await this.prisma.invite.findUniqueOrThrow({ where: { token } })
    return {
      id: invite.id,
      token: invite.token,
      role: invite.role,
      agencyId: invite.agencyId,
      level: invite.level,
      email: invite.email,
      accepted: invite.accepted,
      expiresAt: invite.expiresAt,
    }
  }

  // 接受邀请 → 创建账号并签发 JWT（校验未使用/未过期）
  // 账号继承邀请的 agencyId / level / parentId，实现机构归属与层级绑定
  async acceptInvite(input: { token: string; name: string; openid?: string }) {
    const invite = await this.prisma.invite.findUnique({ where: { token: input.token } })
    if (!invite) throw new NotFoundException('邀请无效')
    if (invite.accepted) throw new ConflictException('邀请已使用')
    if (invite.expiresAt.getTime() < Date.now()) throw new ConflictException('邀请已过期')
    const user = await this.prisma.user.create({
      data: {
        name: input.name,
        role: invite.role,
        agencyId: invite.agencyId,
        level: invite.level,
        parentId: invite.parentId ?? invite.createdById,
        openid: input.openid ?? null,
      },
    })
    await this.prisma.invite.update({ where: { id: invite.id }, data: { accepted: true } })
    return { token: await this.signToken(user), user: this.toUserView(user) }
  }

  // 邀请列表（按权限）：一手可见全部；机构仅见本机构邀请
  listInvites(caller: AuthPrincipal) {
    if (caller.role === 'pandaking') {
      return this.prisma.invite.findMany({ orderBy: { createdAt: 'desc' } })
    }
    if (!caller.agencyId) return []
    return this.prisma.invite.findMany({
      where: { agencyId: caller.agencyId },
      orderBy: { createdAt: 'desc' },
    })
  }

  private genToken() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36)
  }

  private expiry() {
    return new Date(Date.now() + 7 * 24 * 3600 * 1000)
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
    if (userId === 'dev') {
      return {
        id: 'dev',
        name: 'dev',
        role: 'pandaking' as Role,
        agencyId: null,
        level: 'admin' as RoleLevel,
        parentId: null,
        email: null,
        disabled: false,
      }
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } })
    return this.toUserView(user)
  }

  // 成员列表（物理隔绝）：一手可见全部；机构成员仅可见「本机构」成员
  listMembers(caller: AuthPrincipal) {
    if (caller.role === 'pandaking') {
      return this.prisma.user.findMany({
        where: { disabled: false },
        orderBy: { createdAt: 'asc' },
      })
    }
    if (!caller.agencyId) return []
    return this.prisma.user.findMany({
      where: { disabled: false, agencyId: caller.agencyId },
      orderBy: { createdAt: 'asc' },
    })
  }

  // 权限矩阵（字段级 + 物理隔绝），供前端渲染当前角色可见字段集
  getPermissionMatrix() {
    return {
      fields: [
        { field: '客户档案', pandaking: '✓', agency: '✓(自身)', provincial: '✗' },
        { field: '行程草案(旅行社)', pandaking: '✓', agency: '✓', provincial: '✓(被分配路线)' },
        { field: '成本①(省地接社成本)', pandaking: '✓', agency: '✗', provincial: '✓(自身)' },
        { field: '成本②(一手利润)', pandaking: '✓', agency: '✗', provincial: '✗' },
        { field: '旅行社加价', pandaking: '✓', agency: '✓', provincial: '✗' },
        { field: '游客报价', pandaking: '✓', agency: '✓', provincial: '✗' },
        { field: '自身被询价成本价', pandaking: '✓', agency: '✗', provincial: '✓(自身)' },
        { field: '他省地接社成本价', pandaking: '✓', agency: '✗', provincial: '✗(隔离)' },
        { field: '知识库', pandaking: '读写', agency: '读', provincial: '✗' },
        { field: '发布案例/全局账号', pandaking: '✓', agency: '✗', provincial: '✗' },
      ],
      roles: ['pandaking', 'agency', 'provincial'] as Role[],
    }
  }

  // 机构管理（Agency）：替换裸 agencyId 字符串，支持真实机构档案
  // 一手：全部可管理；机构用户：只读本机构
  async createAgency(
    body: { id: string; name: string; role: Role; contact?: string },
    caller: AuthPrincipal,
  ) {
    if (caller.role !== 'pandaking') {
      throw new UnauthorizedException('仅一手 PandaKing 可创建机构')
    }
    if (!body.id?.trim() || !body.name?.trim()) {
      throw new BadRequestException('机构编号与名称必填')
    }
    if (!['agency', 'provincial'].includes(body.role)) {
      throw new BadRequestException('机构角色必须是 agency 或 provincial')
    }
    const existing = await this.prisma.agency.findUnique({ where: { id: body.id.trim() } })
    if (existing) throw new ConflictException('机构编号已存在')
    return this.prisma.agency.create({
      data: {
        id: body.id.trim(),
        name: body.name.trim(),
        role: body.role,
        contact: body.contact?.trim() || null,
      },
    })
  }

  listAgencies(caller: AuthPrincipal) {
    if (caller.role === 'pandaking') {
      return this.prisma.agency.findMany({ orderBy: { createdAt: 'asc' } })
    }
    if (!caller.agencyId) return []
    return this.prisma.agency.findMany({
      where: { id: caller.agencyId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async updateMemberRole(id: string, role: Role, caller: AuthPrincipal) {
    if (caller.role !== 'pandaking') {
      throw new UnauthorizedException('仅一手 PandaKing 可调整成员角色')
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } })
    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
    })
    return this.toUserView(updated)
  }

  // 停用成员（失效其 token；仅一手）
  async disableMember(id: string, caller: AuthPrincipal) {
    if (caller.role !== 'pandaking') {
      throw new UnauthorizedException('仅一手 PandaKing 可停用成员')
    }
    if (id === caller.id) throw new BadRequestException('不可停用当前账号自身')
    const updated = await this.prisma.user.update({
      where: { id },
      data: { disabled: true },
    })
    return this.toUserView(updated)
  }

  private toUserView(u: {
    id: string
    name: string
    role: Role
    agencyId: string | null
    level?: RoleLevel
    parentId?: string | null
    email: string | null
    disabled: boolean
  }): AuthUserView {
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      agencyId: u.agencyId,
      level: u.level ?? 'staff',
      parentId: u.parentId ?? null,
      email: u.email,
      disabled: u.disabled,
    }
  }
}
