import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'

// TODO: 后续接 @nestjs/jwt 实现真实鉴权（微信 OAuth2 → JWT）。
// 当前 dev 放行，并注入默认用户，便于骨架跑通与接口联调；
// 接入后改为校验 Authorization Bearer，并从 token 解析 role。
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest()
    if (!req.user) {
      req.user = { id: 'dev', role: 'pandaking' }
    }
    return true
  }
}
