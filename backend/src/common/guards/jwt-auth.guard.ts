import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Request } from 'express'

interface AuthUser {
  id: string
  role: 'pandaking' | 'agency' | 'provincial'
}

// JWT 守卫：
// - 携带有效 Bearer 时校验并注入 req.user（role 取自 token，决定字段级可见性）
// - 无 token / 无效 且 DEV_BYPASS_AUTH=true（开发态）时注入默认一手用户，便于联调
// - 生产且无有效 token 时返回 401
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>()

    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined

    if (token) {
      try {
        const payload = await this.jwt.verifyAsync(token)
        req.user = { id: payload.sub, role: payload.role } as AuthUser
        return true
      } catch {
        // 落到下方按 dev/prod 处理
      }
    }

    if (process.env.DEV_BYPASS_AUTH === 'true') {
      req.user = { id: 'dev', role: 'pandaking' } as AuthUser
      return true
    }

    throw new UnauthorizedException('未授权')
  }
}
