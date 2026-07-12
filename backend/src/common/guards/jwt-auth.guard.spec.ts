import { describe, expect, it, vi } from 'vitest'
import { JwtService } from '@nestjs/jwt'
import { UnauthorizedException } from '@nestjs/common'
import { JwtAuthGuard } from './jwt-auth.guard'

function ctxWith(header?: string) {
  const req: any = { headers: header ? { authorization: header } : {}, user: undefined }
  const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) }
  return { req, ctx }
}

describe('JwtAuthGuard', () => {
  it('DEV_BYPASS_AUTH=true 注入默认一手用户', async () => {
    process.env.DEV_BYPASS_AUTH = 'true'
    const guard = new JwtAuthGuard(new JwtService({ secret: 'x' }))
    const { req, ctx } = ctxWith()
    expect(await guard.canActivate(ctx)).toBe(true)
    expect(req.user.role).toBe('pandaking')
  })

  it('缺少 Bearer 头抛 Unauthorized', async () => {
    process.env.DEV_BYPASS_AUTH = 'false'
    const guard = new JwtAuthGuard(new JwtService({ secret: 'x' }))
    const { ctx } = ctxWith()
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('有效 token 注入 req.user', async () => {
    process.env.DEV_BYPASS_AUTH = 'false'
    const jwt = new JwtService({ secret: 'secret' })
    const token = await jwt.signAsync({ sub: 'u9', role: 'agency', name: 'Z' })
    const guard = new JwtAuthGuard(jwt)
    const { req, ctx } = ctxWith(`Bearer ${token}`)
    expect(await guard.canActivate(ctx)).toBe(true)
    expect(req.user.id).toBe('u9')
    expect(req.user.role).toBe('agency')
  })

  it('过期/伪造 token 抛 Unauthorized', async () => {
    process.env.DEV_BYPASS_AUTH = 'false'
    const guard = new JwtAuthGuard(new JwtService({ secret: 'secret' }))
    const { ctx } = ctxWith('Bearer not-a-valid-token')
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException)
  })
})
