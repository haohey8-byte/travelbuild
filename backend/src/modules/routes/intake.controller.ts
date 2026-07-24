import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { ShareTokenGuard } from '../../common/guards/share-token.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RoutesService } from './routes.service'
import { Role } from './role-visibility'

interface AuthUser {
  id: string
  role: Role
  agencyId: string | null
  level: 'admin' | 'staff'
}

// 机构提交链接（route-intake）：免登录提交，仅 PandaKing 可预发链接。
// 独立于 RoutesController（后者类级挂 JwtAuthGuard），避免提交端点被强制走登录态。
// 路径前缀用 'intake' 而非 'routes'：RoutesController 上有 @Get(':id') 通配，会抢先
// 匹配 /routes/intake-links 当成 id='intake-links' 查 Route 表 → 抛"路线不存在"。
// 独立前缀彻底避免通配路径污染。
@Controller('intake')
export class IntakeController {
  constructor(private readonly svc: RoutesService) {}

  // 预发机构提交链接：钉死 agencyId，返回 token + H5 链接。
  // 一手 PandaKing 可为任意境外社预发；境外社仅可为「自己机构」预发（双向协作）。
  // 支持有效期选项：permanent / expiresInDays / customExpiresAt + note。每机构单条常驻（重复预发作废旧链接）。
  @Post('intake-link')
  @UseGuards(JwtAuthGuard)
  createIntakeLink(
    @Body() body: { agencyId?: string; permanent?: boolean; expiresInDays?: number; customExpiresAt?: string; note?: string },
    @CurrentUser() user: AuthUser,
  ) {
    const opts = {
      permanent: body.permanent,
      expiresInDays: body.expiresInDays,
      customExpiresAt: body.customExpiresAt,
      note: body.note,
    }
    if (user.role === 'pandaking') {
      if (!body.agencyId) throw new BadRequestException('请指定机构')
      return this.svc.createIntakeLink(body.agencyId, user.id, opts)
    }
    if (user.role === 'agency') {
      if (!user.agencyId) throw new BadRequestException('当前账号未绑定机构')
      // 境外社只能为自己的机构预发链接（忽略 body.agencyId，防越权）
      return this.svc.createIntakeLink(user.agencyId, user.id, opts)
    }
    throw new ForbiddenException('无权限操作')
  }

  // 原地编辑提交链接（PATCH）：改有效期 / 备注，不改 token。一手可编辑任意；境外社仅可编辑自己机构。
  @Patch('intake-link/:token')
  @UseGuards(JwtAuthGuard)
  updateIntakeLink(
    @Param('token') token: string,
    @Body() body: { permanent?: boolean; expiresInDays?: number; customExpiresAt?: string; note?: string },
    @CurrentUser() user: AuthUser,
  ) {
    if (user.role !== 'pandaking' && user.role !== 'agency') {
      throw new ForbiddenException('无权限操作')
    }
    return this.svc.updateIntakeLink(token, user, {
      permanent: body.permanent,
      expiresInDays: body.expiresInDays,
      customExpiresAt: body.customExpiresAt,
      note: body.note,
    })
  }

  // 撤销提交链接（DELETE）：作废 token，旧链接立即失效。一手可撤任意；境外社仅可撤自己机构。
  @Delete('intake-link/:token')
  @UseGuards(JwtAuthGuard)
  deleteIntakeLink(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    if (user.role !== 'pandaking' && user.role !== 'agency') {
      throw new ForbiddenException('无权限操作')
    }
    return this.svc.deleteIntakeLink(token, user)
  }

  // 机构凭链接免登录提交路线初稿（ShareTokenGuard 校验提交令牌 + 过期）
  @Post('intake')
  @UseGuards(ShareTokenGuard)
  submitIntake(@Body() body: any) {
    return this.svc.submitIntake(body)
  }

  // 已生成链接列表：一手见全部；境外社仅见自己机构的链接；省地接社无
  @Get('intake-links')
  @UseGuards(JwtAuthGuard)
  listIntakeLinks(@CurrentUser() user: AuthUser) {
    return this.svc.listIntakeLinks(user)
  }

  // 复制计数（复制历史）：一手与境外社可操作（境外社仅见自己链接，但允许复制）
  @Post('intake-link/:token/copy')
  @UseGuards(JwtAuthGuard)
  markCopied(@Param('token') token: string, @CurrentUser() user: AuthUser) {
    if (user.role !== 'pandaking' && user.role !== 'agency') {
      throw new ForbiddenException('无权限操作')
    }
    return this.svc.markCopied(token)
  }
}
