import { Controller, Get, Param, Query, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { CaseService } from './case.service'
import { renderCaseOgPage, renderCaseOgError } from './case-og-page'

// 案例 OG 分享页（公开，免登录）
// - GET /share/case/:id?via=agencyId → 服务端渲染带 OG 注入的 HTML（微信/社交分享卡片 + 客户直接查看）
// - GET /share/case/:id/html?lang=en|th → 返回对应语言的微站 contentHtml（无则回落 404，前端缺译回落 zh）
// 注意：该控制器路径已通过 main.ts 的 setGlobalPrefix exclude 排除 /api 前缀。
// 与 routes/OgPageController（/share/route/:token 协作 H5）同模式，内容为公开案例（脱敏、无价格明细）。
@Controller('share')
export class CaseOgController {
  constructor(private readonly svc: CaseService) {}

  @Get('case/:id')
  async og(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
    @Query('via') via?: string,
  ) {
    // 生产环境 CloudBase 外部永远 https；LB 未传 x-forwarded-proto 时默认 https
    const protocol = req.get('x-forwarded-proto') || 'https'
    const origin = `${protocol}://${req.get('host')}`
    const shareUrl = `${origin}/share/case/${encodeURIComponent(id)}${
      via ? `?via=${encodeURIComponent(via)}` : ''
    }`
    try {
      const c = await this.svc.getPublished(id, via)
      const html = renderCaseOgPage(
        {
          id,
          title: c.title,
          titleEn: c.titleEn,
          titleTh: c.titleTh,
          destination: c.destination,
          days: c.days,
          groupSize: c.groupSize,
          travelDate: c.travelDate,
          vehicle: c.vehicle,
          priceRange: c.priceRange,
          cover: c.cover,
          highlights: c.highlights,
          highlightsEn: c.highlightsEn,
          highlightsTh: c.highlightsTh,
          descZh: c.descZh,
          descEn: c.descEn,
          descTh: c.descTh,
          daysContent: c.daysContent,
          daysContentEn: c.daysContentEn,
          daysContentTh: c.daysContentTh,
          contentHtml: c.contentHtml,
          contentHtmlEn: c.contentHtmlEn,
          contentHtmlTh: c.contentHtmlTh,
          agency: c.agencyBranding
            ? {
                name: c.agencyBranding.name,
                logoUrl: c.agencyBranding.logoUrl,
                contacts: c.agencyBranding.contacts,
              }
            : null,
        },
        shareUrl,
        origin,
      )
      res.type('text/html; charset=utf-8').send(html)
    } catch {
      res
        .type('text/html; charset=utf-8')
        .send(renderCaseOgError(shareUrl, `${origin}/share/og-cover.png`))
    }
  }

  // 按需返回对应语言的微站 contentHtml（供分享页 iframe 切换 en/th 时拉取）。
  // 缺译（contentHtmlEn/Th 为空）或案例未发布 → 404，前端据此回落 zh 微站。
  @Get('case/:id/html')
  async html(
    @Param('id') id: string,
    @Query('lang') lang: string,
    @Res() res: Response,
  ) {
    const l = (lang || '').toLowerCase()
    try {
      const c = await this.svc.getPublished(id)
      let htmlStr: string | null = null
      if (l === 'en') htmlStr = c.contentHtmlEn
      else if (l === 'th') htmlStr = c.contentHtmlTh
      else htmlStr = c.contentHtml
      if (!htmlStr) {
        return res.status(404).type('text/html; charset=utf-8').send('')
      }
      res.type('text/html; charset=utf-8').send(htmlStr)
    } catch {
      res.status(404).type('text/html; charset=utf-8').send('')
    }
  }
}
