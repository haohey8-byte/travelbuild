import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as bcrypt from 'bcryptjs'
import { PrismaService } from '../../prisma/prisma.service'
import { genToken as genCryptoToken } from '../../common/utils/token.util'

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
  phone: string | null
  email: string | null
  disabled: boolean
  mustChangePwd: boolean
}

export interface AdminView {
  id: string
  name: string
  phone: string
  disabled: boolean
  mustChangePwd: boolean
  createdAt: Date
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  // 登录失败限流（进程内；key = phone+IP，5 次/10 分钟锁定；多实例需 Redis 列 Phase 2）
  private readonly failMap = new Map<string, { count: number; first: number }>()
  private readonly lockMap = new Map<string, number>()

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
        phone: `invite_${invite.id}`,
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
    return genCryptoToken()
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

  // ===== 账号密码登录（管理员 = 手机号 + 密码，bcrypt cost 12） =====
  private checkLock(key: string): { locked: boolean; retryAfter?: number } {
    const until = this.lockMap.get(key)
    if (until && until > Date.now()) {
      return { locked: true, retryAfter: Math.ceil((until - Date.now()) / 1000) }
    }
    if (until) this.lockMap.delete(key)
    return { locked: false }
  }

  private registerFailure(key: string) {
    const now = Date.now()
    const rec = this.failMap.get(key)
    if (!rec || now - rec.first > 10 * 60 * 1000) {
      this.failMap.set(key, { count: 1, first: now })
    } else {
      rec.count += 1
      this.failMap.set(key, rec)
    }
    const cur = this.failMap.get(key)!
    if (cur.count >= 5) {
      this.lockMap.set(key, now + 10 * 60 * 1000)
      this.failMap.delete(key)
    }
  }

  private clearFailures(key: string) {
    this.failMap.delete(key)
    this.lockMap.delete(key)
  }

  async login(phone: string, password: string, clientIp: string) {
    if (!/^1[3-9]\d{9}$/.test(phone) || !password) {
      throw new BadRequestException({ code: 'VALIDATION', message: '手机号格式错误或密码为空' })
    }
    const key = `${phone}@${clientIp}`
    const lock = this.checkLock(key)
    if (lock.locked) {
      throw new UnauthorizedException({
        code: 'AUTH_LOCKED',
        message: '登录失败次数过多，请稍后再试',
        retryAfter: lock.retryAfter,
      })
    }
    const user = await this.prisma.user.findFirst({
      where: { phone, disabled: false },
    })
    if (!user || !user.password) {
      this.registerFailure(key)
      throw new UnauthorizedException({ code: 'AUTH_INVALID_CREDENTIALS', message: '手机号或密码错误' })
    }
    const ok = await bcrypt.compare(password, user.password)
    if (!ok) {
      this.registerFailure(key)
      throw new UnauthorizedException({ code: 'AUTH_INVALID_CREDENTIALS', message: '手机号或密码错误' })
    }
    this.clearFailures(key)
    const token = await this.signToken(user)
    return user.mustChangePwd
      ? { token, user: this.toUserView(user), requireChangePwd: true }
      : { token, user: this.toUserView(user) }
  }

  async changePwd(userId: string, oldPwd: string, newPwd: string) {
    if (!newPwd || newPwd.length < 8) {
      throw new BadRequestException({ code: 'VALIDATION', message: '新密码至少 8 位' })
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } })
    if (!user.password || !(await bcrypt.compare(oldPwd, user.password))) {
      throw new UnauthorizedException({ code: 'AUTH_INVALID_CREDENTIALS', message: '原密码错误' })
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { password: await bcrypt.hash(newPwd, 12), mustChangePwd: false },
    })
    return { ok: true, user: this.toUserView(updated) }
  }

  // ===== 管理员管理（均限 pandaking 调用） =====
  async listAdmins(): Promise<AdminView[]> {
    const users = await this.prisma.user.findMany({
      where: { role: 'pandaking' },
      orderBy: { createdAt: 'asc' },
    })
    return users.map((u) => this.toAdminView(u))
  }

  async createAdmin(input: { name: string; phone: string; initPwd: string }, caller: AuthPrincipal) {
    if (caller.role !== 'pandaking') {
      throw new UnauthorizedException('仅一手 PandaKing 可管理管理员')
    }
    if (!input.name?.trim()) throw new BadRequestException({ code: 'VALIDATION', message: '名称必填' })
    if (!/^1[3-9]\d{9}$/.test(input.phone || '')) {
      throw new BadRequestException({ code: 'VALIDATION', message: '手机号格式错误' })
    }
    if (!input.initPwd || input.initPwd.length < 8) {
      throw new BadRequestException({ code: 'VALIDATION', message: '初始密码至少 8 位' })
    }
    const exists = await this.prisma.user.findFirst({ where: { phone: input.phone.trim() } })
    if (exists) throw new ConflictException({ code: 'ADMIN_PHONE_EXISTS', message: '该手机号已存在' })
    const user = await this.prisma.user.create({
      data: {
        name: input.name.trim(),
        phone: input.phone.trim(),
        role: 'pandaking',
        level: 'admin',
        password: await bcrypt.hash(input.initPwd, 12),
        mustChangePwd: true,
        disabled: false,
      },
    })
    return this.toAdminView(user)
  }

  async resetAdminPwd(id: string, initPwd: string, caller: AuthPrincipal) {
    if (caller.role !== 'pandaking') {
      throw new UnauthorizedException('仅一手 PandaKing 可管理管理员')
    }
    if (!initPwd || initPwd.length < 8) {
      throw new BadRequestException({ code: 'VALIDATION', message: '新密码至少 8 位' })
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } })
    if (user.role !== 'pandaking') throw new BadRequestException('只能重置管理员密码')
    await this.prisma.user.update({
      where: { id },
      data: { password: await bcrypt.hash(initPwd, 12), mustChangePwd: true },
    })
    return { ok: true }
  }

  async disableAdmin(id: string, caller: AuthPrincipal) {
    if (caller.role !== 'pandaking') {
      throw new UnauthorizedException('仅一手 PandaKing 可管理管理员')
    }
    if (id === caller.id) throw new BadRequestException('不可禁用当前账号自身')
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id } })
    if (user.role !== 'pandaking') throw new BadRequestException('只能禁用管理员')
    const enabled = await this.prisma.user.count({
      where: { role: 'pandaking', disabled: false, NOT: { id } },
    })
    if (enabled < 1) throw new BadRequestException({ code: 'ADMIN_LAST_ONE', message: '至少保留一个可用管理员' })
    const updated = await this.prisma.user.update({ where: { id }, data: { disabled: true } })
    return this.toAdminView(updated)
  }

  private toAdminView(u: {
    id: string
    name: string
    phone?: string | null
    disabled: boolean
    mustChangePwd?: boolean
    createdAt: Date
  }): AdminView {
    return {
      id: u.id,
      name: u.name,
      phone: u.phone ? this.maskPhone(u.phone) : '',
      disabled: u.disabled,
      mustChangePwd: u.mustChangePwd ?? false,
      createdAt: u.createdAt,
    }
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
        phone: null,
        email: null,
        disabled: false,
        mustChangePwd: false,
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
  // D1/D4：建机构时一并建该机构的控制台登录账号（User），phone 为登录键、初始密码强制改密。
  async createAgency(
    body: { id?: string; name: string; role: Role; contact?: string; phone: string; initPwd?: string },
    caller: AuthPrincipal,
  ) {
    if (caller.role !== 'pandaking') {
      throw new UnauthorizedException('仅一手 PandaKing 可创建机构')
    }
    if (!body.name?.trim()) {
      throw new BadRequestException('机构名称必填')
    }
    if (!['agency', 'provincial'].includes(body.role)) {
      throw new BadRequestException('机构角色必须是 agency 或 provincial')
    }
    if (!/^1[3-9]\d{9}$/.test(body.phone || '')) {
      throw new BadRequestException({ code: 'VALIDATION', message: '手机号格式错误' })
    }
    // 编号：调用方未传则由系统按角色前缀自动生成（agency- / provincial- + 随机串），保证唯一
    const id = body.id?.trim() || (await this.genAgencyId(body.role))
    const existing = await this.prisma.agency.findUnique({ where: { id } })
    if (existing) throw new ConflictException('机构编号已存在')
    const phoneTaken = await this.prisma.user.findFirst({ where: { phone: body.phone.trim() } })
    if (phoneTaken) throw new ConflictException({ code: 'AGENCY_PHONE_EXISTS', message: '该手机号已存在' })

    // 初始密码：调用方未传则后端生成强密码，一次性返回（不落库明文）
    const initPwd = body.initPwd && body.initPwd.length >= 8 ? body.initPwd : this.genStrongPwd()

    const agency = await this.prisma.agency.create({
      data: {
        id,
        name: body.name.trim(),
        role: body.role,
        contact: body.contact?.trim() || null,
      },
    })
    const user = await this.prisma.user.create({
      data: {
        name: body.name.trim(),
        phone: body.phone.trim(),
        role: body.role,
        agencyId: agency.id,
        level: 'admin',
        password: await bcrypt.hash(initPwd, 12),
        mustChangePwd: true,
        disabled: false,
      },
    })
    return { agency, user: this.toUserView(user), initPwd }
  }

  // 删除机构：硬删 + 前置校验（无进行中路线、无未过期提交链接才允许）
  async deleteAgency(id: string, caller: AuthPrincipal) {
    if (caller.role !== 'pandaking') {
      throw new UnauthorizedException('仅一手 PandaKing 可删除机构')
    }
    const agency = await this.prisma.agency.findUnique({ where: { id } })
    if (!agency) throw new NotFoundException({ code: 'AGENCY_NOT_FOUND', message: '机构不存在' })

    // 终态集合：处于这些状态的路线视为已结束，不阻碍删除
    const TERMINAL = ['completed', 'cancelled', 'archived', 'done', 'offline']
    const activeRoute = await this.prisma.route.findFirst({
      where: {
        OR: [{ agencyId: id }, { provincialId: id }],
        NOT: { statusKey: { in: TERMINAL } },
      },
    })
    if (activeRoute) {
      throw new BadRequestException({
        code: 'AGENCY_HAS_ACTIVE_ROUTES',
        message: '该机构仍有进行中路线，暂不能删除',
      })
    }
    const activeLink = await this.prisma.routeIntake.findFirst({
      where: { agencyId: id, expiresAt: { gt: new Date() } },
    })
    if (activeLink) {
      throw new BadRequestException({
        code: 'AGENCY_HAS_ACTIVE_LINK',
        message: '该机构仍有未过期提交链接，暂不能删除',
      })
    }
    // 级联清理：过期链接 + 关联账号 + 机构本身（Route 外键 SetNull 保底不丢）
    await this.prisma.routeIntake.deleteMany({ where: { agencyId: id } })
    await this.prisma.user.deleteMany({ where: { agencyId: id } })
    await this.prisma.agency.delete({ where: { id } })
    return { ok: true }
  }

  // 生成 12 位强密码（用于机构账号初始密码，一次性返回）
  private genStrongPwd(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let s = ''
    for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)]
    return s
  }

  // 按角色前缀自动生成唯一机构编号（agency- / provincial- + 8 位随机串；极端兜底用时间戳）
  // 保留前缀语义：仍可一眼区分境外旅行社 / 省地接社，但由系统生成，调用方无需手填。
  private async genAgencyId(role: Role): Promise<string> {
    const prefix = role === 'provincial' ? 'provincial-' : 'agency-'
    for (let i = 0; i < 8; i++) {
      const candidate = prefix + Math.random().toString(36).slice(2, 10)
      const exists = await this.prisma.agency.findUnique({ where: { id: candidate } })
      if (!exists) return candidate
    }
    return prefix + Date.now().toString(36)
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
    phone?: string | null
    email: string | null
    disabled: boolean
    mustChangePwd?: boolean
  }): AuthUserView {
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      agencyId: u.agencyId,
      level: u.level ?? 'staff',
      parentId: u.parentId ?? null,
      phone: u.phone ? this.maskPhone(u.phone) : null,
      email: u.email,
      disabled: u.disabled,
      mustChangePwd: u.mustChangePwd ?? false,
    }
  }

  private maskPhone(phone?: string | null): string {
    if (!phone) return ''
    return phone.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2')
  }
}
