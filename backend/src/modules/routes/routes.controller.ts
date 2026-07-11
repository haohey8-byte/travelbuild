import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common'
import { RoutesService } from './routes.service'

// 路线与版本 —— 对应 doc/04-接口契约/路线与版本.md
@Controller('routes')
export class RoutesController {
  constructor(private readonly svc: RoutesService) {}

  @Get()
  findAll(@Query('status') status?: string) {
    return this.svc.findAll(status)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  @Post()
  create(@Body() body: any) {
    return this.svc.create(body)
  }

  // 保存并通知：生成新 version
  @Post(':id/versions')
  saveVersion(@Param('id') id: string, @Body() body: any) {
    return this.svc.saveVersion(id, body)
  }
}
