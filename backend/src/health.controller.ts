import { Controller, Get } from '@nestjs/common'

// 部署健康检查（架构 v1 §6）：GET /api/health
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', ts: new Date().toISOString() }
  }
}
