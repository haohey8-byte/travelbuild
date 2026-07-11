import { createParamDecorator, ExecutionContext } from '@nestjs/common'

// 从请求中提取当前用户（由 JwtAuthGuard 注入 req.user）
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest()
    return req.user
  },
)
