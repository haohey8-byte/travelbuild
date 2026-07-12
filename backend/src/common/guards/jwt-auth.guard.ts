import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

export interface AuthUser {
  id: string
  role: 'pandaking' | 'agency' | 'provincial'
  name?: string
}

// 真实 JWT 守卫：校验 Authorization: Bearer <token>，从 payload 注入 req.user。
// 开发旁路：DEV_BYPASS_AUTH=true 时免 token，注入默认一手用户，便于骨架联调与接口调试。
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()

    // 开发旁路：免鉴权注入默认用户
    if (process.env.DEV_BYPASS_AUTH === 'true') {
      if (!req.user) req.user = { id: 'dev', role: 'pandaking', name: 'dev' }
      return true
    }

    const header = req.headers?.authorization
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('缺少 Authorization Bearer')
    }
    const token = header.slice(7)
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; role: AuthUser['role']; name?: string }>(
        token,
      )
      req.user = { id: payload.sub, role: payload.role, name: payload.name }
      return true
    } catch {
      throw new UnauthorizedException('无效或过期的 token')
    }
  }
}
