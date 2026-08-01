import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CaseService } from './case.service'

interface AuthUser {
  id: string
  role?: 'pandaking' | 'agency' | 'provincial'
  agencyId?: string | null
}

// 案例展示（脱敏） —— 对应 doc/04-接口契约/案例.md 与 PRD 4.8.6
// 公开只读已发布案例；管理（建/改/发布/下线/删）需登录
// 权限：pandaking 全量；agency 仅管理归属自己机构的案例（agencyId）
// 限流：公开写操作（创建/导入）30 次/分/IP
@Controller('cases')
export class CaseController {
  constructor(private readonly svc: CaseService) {}

  // 公开：已发布案例列表（案例展示页）
  @Get()
  listPublic() {
    return this.svc.listPublished()
  }

  // 公开：已发布案例详情（via=agencyId 时内嵌联合品牌档案）
  @Get(':id')
  getPublic(@Param('id') id: string, @Query('via') via?: string) {
    return this.svc.getPublished(id, via)
  }

  // 管理：全量（含草稿/下线）
  @Get('manage/all')
  @UseGuards(JwtAuthGuard)
  listAll(@CurrentUser() user: AuthUser) {
    return this.svc.listAll(user)
  }

  // 管理：单个案例（含草稿/下线）—— 管理端编辑入口（公开接口仅 published，草稿打不开）
  // 注意：声明在 :id 之后 + 两段路径（manage/:id），与单段 :id 不冲突
  @Get('manage/:id')
  @UseGuards(JwtAuthGuard)
  getManage(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.getManage(id, user)
  }

  // 管理：新建案例（归属机构取创建人 agencyId）
  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  create(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.svc.create({ ...body, createdById: user.id, agencyId: user.agencyId ?? null })
  }

  // 管理：由已确认路线派生脱敏草稿
  @Post('from-route/:routeId')
  @UseGuards(JwtAuthGuard)
  fromRoute(@Param('routeId') routeId: string, @CurrentUser() user: AuthUser) {
    return this.svc.publishFromRoute(routeId, user.id)
  }

  // 管理：导入 HTML 微站直接创建草稿（sanitize + 抽 h1 标题；其余字段编辑页补全）
  @Post('import-html')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  importHtml(@Body() body: any, @CurrentUser() user: AuthUser) {
    const html = body?.html
    if (typeof html !== 'string' || !html.trim()) {
      return { error: 'html 字段必填' }
    }
    if (Buffer.byteLength(html, 'utf8') > 5 * 1024 * 1024) {
      return { error: 'HTML 文件超过 5MB 上限' }
    }
    return this.svc.importCaseHtml(html, user.id, user.agencyId)
  }

  // 管理：发布（自动补翻 En/Th）
  @Post(':id/publish')
  @UseGuards(JwtAuthGuard)
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.publish(id, user)
  }

  // 管理：AI 翻译（手动触发/重翻：中文 → en/th）
  @Post(':id/translate')
  @UseGuards(JwtAuthGuard)
  translate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.translateCase(id, user)
  }

  // 管理：下线
  @Post(':id/unpublish')
  @UseGuards(JwtAuthGuard)
  unpublish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.unpublish(id, user)
  }

  // 管理：编辑
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: AuthUser) {
    return this.svc.update(id, body, user)
  }

  // 管理：删除
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.svc.remove(id, user)
  }
}
