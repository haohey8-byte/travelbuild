import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'

// TODO: 后续接 @nestjs/jwt 实现真实鉴权（微信 OAuth2 → JWT）。
// 当前放行，便于骨架跑通；接入后改为校验 Authorization Bearer。
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(_ctx: ExecutionContext): boolean {
    return true
  }
}
