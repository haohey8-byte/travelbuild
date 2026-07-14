import { Controller, Get, Param, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RoutesService } from './routes.service'
import { renderH5Page, renderH5Error } from './h5-page'

// 协作 H5 分享页（公开，免登录）
// - GET /share/route/:token  → 服务端渲染带 OG 注入的 HTML（供微信/社交分享卡片 + 客户直接查看）
// - GET /share/og-cover.png  → 分享封面图（og:image）
// 注意：该控制器路径已通过 main.ts 的 setGlobalPrefix exclude 排除 /api 前缀。
@Controller('share')
export class OgPageController {
  constructor(private readonly svc: RoutesService) {}

  @Get('route/:token')
  async h5(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const origin = `${req.protocol}://${req.get('host')}`
    const shareUrl = `${origin}/share/route/${encodeURIComponent(token)}`
    const coverUrl = `${origin}/share/og-cover.png`
    try {
      const d = await this.svc.getH5(token)
      const html = renderH5Page(
        {
          token,
          destination: d.destination,
          customerNameCn: d.customerNameCn,
          customerName: d.customerName,
          groupSize: d.groupSize,
          travelDate: d.travelDate,
          version: d.version,
          statusKey: d.statusKey,
          itinerary: d.itinerary,
          guestPrice: d.guestPrice,
        },
        shareUrl,
        coverUrl,
      )
      res.type('text/html; charset=utf-8').send(html)
    } catch {
      res.type('text/html; charset=utf-8').send(renderH5Error(shareUrl, coverUrl))
    }
  }

  @Get('og-cover.png')
  cover(@Res() res: Response) {
    const file = join(process.cwd(), 'public', 'og-cover.png')
    if (!existsSync(file)) {
      res.status(404).end()
      return
    }
    res.type('image/png').send(readFileSync(file))
  }
}
