import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: 接微信 OAuth2，返回授权 URL
  buildWechatAuthUrl() {
    return { url: 'https://open.weixin.qq.com/connect/oauth2/authorize?appid=<WECHAT_APPID>&redirect_uri=<CB>&response_type=code&scope=snsapi_userinfo' }
  }

  // TODO: code 换 openid → 匹配/创建用户 → 发 JWT
  exchangeCode(_code: string) {
    return { token: 'TODO', user: null }
  }

  async createInvite(body: { email?: string; role: string }) {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36)
    return this.prisma.invite.create({
      data: {
        token,
        role: body.role as any,
        email: body.email,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
        createdById: 'seed',
      },
    })
  }

  getInvite(token: string) {
    return this.prisma.invite.findUniqueOrThrow({ where: { token } })
  }

  listMembers() {
    return this.prisma.user.findMany({ where: { disabled: false } })
  }
}
