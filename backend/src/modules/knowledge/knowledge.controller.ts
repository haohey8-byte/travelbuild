import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { KbService } from './knowledge.service'

interface AuthUser {
  id: string
}

// 知识库 —— 对应 doc/04-接口契约/知识库.md
// 读公开；写需登录（一手/管理员维护沉淀）
@Controller('knowledge')
export class KbController {
  constructor(private readonly svc: KbService) {}

  @Get()
  list(
    @Query('category') category?: string,
    @Query('tag') tag?: string,
    @Query('q') q?: string,
  ) {
    return this.svc.list({ category, tag, q })
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.svc.getById(id)
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() body: any, @CurrentUser() user: AuthUser) {
    return this.svc.create({ ...body, createdById: user.id })
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id') id: string, @Body() body: any) {
    return this.svc.update(id, body)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }
}
