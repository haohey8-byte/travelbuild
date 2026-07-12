import { describe, expect, it, vi } from 'vitest'
import { JwtService } from '@nestjs/jwt'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { AuthService } from './auth.service'

function makeSvc(prismaMock: any) {
  return new AuthService(prismaMock as any, new JwtService({ secret: 'test-secret' }))
}

describe('AuthService', () => {
  it('signToken 签发的 token 可被 JwtService 校验', async () => {
    const svc = makeSvc({})
    const token = await (svc as any).signToken({ id: 'u1', role: 'agency', name: 'A' })
    const jwt = new JwtService({ secret: 'test-secret' })
    const payload = await jwt.verifyAsync(token)
    expect(payload.sub).toBe('u1')
    expect(payload.role).toBe('agency')
  })

  it('acceptInvite 成功创建用户并签发 token', async () => {
    const created = {
      id: 'u2',
      name: 'B',
      role: 'agency',
      agencyId: null,
      email: null,
      disabled: false,
    }
    const prisma = {
      invite: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'i1',
          token: 't',
          role: 'agency',
          accepted: false,
          expiresAt: new Date(Date.now() + 100000),
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      user: { create: vi.fn().mockResolvedValue(created) },
    }
    const svc = makeSvc(prisma)
    const res = await svc.acceptInvite({ token: 't', name: 'B' })
    expect(typeof res.token).toBe('string')
    expect(prisma.user.create).toHaveBeenCalled()
    expect(res.user.role).toBe('agency')
  })

  it('acceptInvite 邀请已使用则抛 Conflict', async () => {
    const prisma = {
      invite: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'i1',
          token: 't',
          role: 'agency',
          accepted: true,
          expiresAt: new Date(Date.now() + 100000),
        }),
      },
      user: { create: vi.fn() },
    }
    const svc = makeSvc(prisma)
    await expect(svc.acceptInvite({ token: 't', name: 'B' })).rejects.toBeInstanceOf(
      ConflictException,
    )
  })

  it('acceptInvite 无效 token 抛 NotFound', async () => {
    const prisma = { invite: { findUnique: vi.fn().mockResolvedValue(null) }, user: { create: vi.fn() } }
    const svc = makeSvc(prisma)
    await expect(svc.acceptInvite({ token: 'x', name: 'B' })).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
