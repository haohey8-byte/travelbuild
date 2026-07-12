import { describe, expect, it } from 'vitest'
import { Test } from '@nestjs/testing'
import { AppModule } from './app.module'
import { AuthService } from './modules/auth/auth.service'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard'
import { JwtService } from '@nestjs/jwt'

// DI 接线校验（无需数据库）：验证 AuthModule 的 JwtService / JwtAuthGuard
// 能跨模块被 RoutesModule 正确解析，避免 boot 时才暴露的注入错误。
describe('AppModule DI 接线', () => {
  it('编译 AppModule 并能解析 AuthService / JwtAuthGuard / JwtService', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService)
    expect(moduleRef.get(JwtAuthGuard)).toBeInstanceOf(JwtAuthGuard)
    expect(moduleRef.get(JwtService)).toBeInstanceOf(JwtService)
  })
})
