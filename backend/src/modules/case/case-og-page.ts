// 案例 OG 分享页（服务端渲染，带 OG 注入）
// 微信/社交爬虫不执行 JS，故分享卡片所需的 og:* 必须由服务端在 HTML 中写死。
// 该页自包含（无 SPA 依赖）：
//   - 爬虫抓取 → 拿 og:title/og:description/og:image/twitter:card/JSON-LD 生成分享卡片
//   - 真实客户直接打开 → 看到完整案例（封面/标题/亮点/描述/每日行程/联合品牌条）
// 与 /share/route/:token（协作 H5）同模式，但内容为公开案例（脱敏、无任何价格明细）。

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtDate(iso?: unknown): string {
  if (!iso) return ''
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// JSON-LD 安全序列化：转义 </script 序列防注入
function jsonSafe(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}

// 图片地址归一化：COS 完整 URL 原样用；相对路径（本地 /uploads/*）拼 origin
// 同时修正历史 bug：早期 cos.storage 把 "https://" 压成 "https:/"，单斜杠自动补回双斜杠
function imgUrl(u: string | null | undefined, origin: string): string {
  if (!u) return ''
  let fixed = u
  if (/^https:\/[^/]/i.test(fixed)) fixed = fixed.replace(/^https:\//i, 'https://')
  if (/^https?:\/\//i.test(fixed)) return fixed
  return `${origin}${fixed.startsWith('/') ? fixed : '/' + fixed}`
}

export interface CaseOgData {
  id: string
  title?: string | null
  destination: string
  days: number
  groupSize?: number | null
  travelDate?: string | Date | null
  vehicle?: string | null
  priceRange?: string | null
  cover?: string | null
  highlights?: string[]
  descZh?: string | null
  daysContent?: unknown
  agency?: { name: string; logoUrl?: string | null; contacts?: unknown } | null
}

export function renderCaseOgPage(
  data: CaseOgData,
  shareUrl: string,
  origin: string,
): string {
  const title = esc(data.title?.trim() || data.destination || 'PandaKing9 定制案例')
  // OG 描述：descZh 前 200 字；无则用亮点标签拼接兜底；联合品牌落款追加在结尾
  const descBase =
    (data.descZh && String(data.descZh).trim()) ||
    (Array.isArray(data.highlights) && data.highlights.filter(Boolean).join('、')) ||
    `${esc(data.destination || '')} ${data.days || 0}天定制行程`
  const agencyLine = data.agency ? `本案例由 ${data.agency.name} 与 PandaKing9 联合提供` : ''
  const desc = [String(descBase).slice(0, 200), agencyLine].filter(Boolean).join('\n')
  const cover = imgUrl(data.cover, origin) || `${origin}/share/og-cover.png`

  const meta: string[] = []
  if (data.days) meta.push(`${data.days} 天`)
  if (data.groupSize) meta.push(`${data.groupSize} 人`)
  const dateText = fmtDate(data.travelDate)
  if (dateText) meta.push(`${dateText} 出行`)
  if (data.vehicle) meta.push(esc(data.vehicle))
  if (data.priceRange) meta.push(esc(data.priceRange))
  const metaHtml = meta.length
    ? `<div class="meta">${meta.map((m) => `<span class="chip">${m}</span>`).join('')}</div>`
    : ''

  const highlights = Array.isArray(data.highlights)
    ? data.highlights.filter(Boolean).map((h) => esc(h))
    : []
  const highlightsHtml = highlights.length
    ? `<div class="chips">${highlights.map((h) => `<span class="chip">${h}</span>`).join('')}</div>`
    : ''

  const days = Array.isArray(data.daysContent) ? data.daysContent : []
  const daysHtml = days.length
    ? `<div class="days">${days
        .map((d: any) => {
          const city = esc(d?.city)
          const spots = Array.isArray(d?.spots)
            ? d.spots.filter(Boolean).map(esc).join('、')
            : ''
          const hotel = d?.hotel ? esc(d.hotel) : ''
          const meals = Array.isArray(d?.meals)
            ? d.meals.filter(Boolean).map(esc).join('、')
            : ''
          const notes = d?.notes ? esc(d.notes) : ''
          const img = d?.image ? imgUrl(d.image, origin) : ''
          return `
        <div class="day">
          <div class="day-h"><span class="day-no">第 ${esc(d?.day ?? '')} 天</span>${city ? `<span class="day-city">${city}</span>` : ''}</div>
          ${img ? `<img class="day-img" src="${esc(img)}" alt="${city}" loading="lazy" />` : ''}
          ${spots ? `<div class="line"><span class="k">景点</span>${spots}</div>` : ''}
          ${hotel ? `<div class="line"><span class="k">住宿</span>${hotel}</div>` : ''}
          ${meals ? `<div class="line"><span class="k">餐饮</span>${meals}</div>` : ''}
          ${notes ? `<div class="line"><span class="k">备注</span>${notes}</div>` : ''}
        </div>`
        })
        .join('')}</div>`
    : ''

  const descBody = data.descZh ? `<div class="desc">${esc(data.descZh)}</div>` : ''

  // 联合品牌条（via=agencyId 有效时）：logo + 名称 + 联系方式 + 「与 PandaKing9 联合提供」
  const agencyHtml = data.agency
    ? (() => {
        const a = data.agency
        const logo = a.logoUrl ? imgUrl(a.logoUrl, origin) : ''
        const c = (a.contacts as Record<string, string> | null) ?? {}
        const contactLines: string[] = []
        const LABELS: [string, string][] = [
          ['facebook', 'Facebook'],
          ['line', 'LINE'],
          ['wechat', '微信'],
          ['phone', '电话'],
          ['email', '邮箱'],
        ]
        for (const [k, label] of LABELS) {
          const v = c[k]
          if (v) contactLines.push(`<span class="c-item"><b>${label}</b>${esc(v)}</span>`)
        }
        return `
      <div class="agency">
        <div class="agency-h">
          ${logo ? `<img class="agency-logo" src="${esc(logo)}" alt="${esc(a.name)}" loading="lazy" />` : '<span class="agency-logo-fallback">' + esc(a.name.slice(0, 1)) + '</span>'}
          <div class="agency-meta">
            <div class="agency-name">${esc(a.name)}</div>
            <div class="agency-co">与 <b>PandaKing9</b> 联合提供</div>
          </div>
        </div>
        ${contactLines.length ? `<div class="agency-c">${contactLines.join('')}</div>` : ''}
      </div>`
      })()
    : ''

  const ld = jsonSafe({
    '@context': 'https://schema.org',
    '@type': 'TravelProduct',
    name: String(data.title?.trim() || data.destination || 'PandaKing9 定制案例'),
    description: String(descBase).slice(0, 200),
    image: cover,
    url: shareUrl,
    provider: {
      '@type': 'Organization',
      name: data.agency ? `${data.agency.name} 与 PandaKing9` : 'PandaKing9',
    },
  })

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${title} | PandaKing9</title>
  <meta name="description" content="${esc(desc.replace(/\n/g, ' '))}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${esc(desc.replace(/\n/g, ' '))}" />
  <meta property="og:image" content="${esc(cover)}" />
  <meta property="og:url" content="${esc(shareUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${esc(desc.replace(/\n/g, ' '))}" />
  <meta name="twitter:image" content="${esc(cover)}" />
  <script type="application/ld+json">${ld}</script>
  <style>
    :root{--brand:#c8102e;--brand-600:#a60d26;--ink:#1c2430;--muted:#76819a;--line:#e8edf4;--bg:#f4f6fa;--card:#fff;}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased;}
    .wrap{max-width:520px;margin:0 auto;padding:0 16px 40px;}
    .brand{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;padding:14px 2px 10px;}
    .brand .dot{width:10px;height:10px;border-radius:50%;background:var(--brand);}
    .brand b{color:var(--brand);font-weight:700;}
    .card{background:var(--card);border-radius:16px;padding:20px;box-shadow:0 6px 20px rgba(20,32,51,.08);margin-top:4px;}
    .cover{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:14px;background:var(--line);}
    h1{font-size:23px;margin:14px 0 10px;line-height:1.35;}
    .meta{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px;}
    .chip{display:inline-block;padding:4px 11px;border-radius:999px;background:#fdeef0;color:var(--brand-600);font-size:12.5px;font-weight:600;}
    .chips{margin-bottom:12px;}
    .desc{font-size:15px;color:var(--ink);white-space:pre-wrap;word-break:break-word;margin-bottom:6px;}
    h3{font-size:15px;margin:18px 0 6px;color:var(--ink);}
    .days{margin-top:4px;}
    .day{border-top:1px solid var(--line);padding:12px 0;}
    .day-h{display:flex;align-items:center;gap:10px;margin-bottom:6px;}
    .day-no{font-weight:700;color:var(--brand);font-size:14px;}
    .day-city{font-weight:600;font-size:15px;}
    .day-img{width:100%;max-height:240px;object-fit:cover;border-radius:10px;margin-bottom:8px;background:var(--line);}
    .line{color:var(--ink);font-size:14px;margin:2px 0 2px 2px;}
    .line .k{display:inline-block;min-width:34px;color:var(--muted);font-size:12px;margin-right:6px;}
    .agency{margin-top:18px;border:1px solid var(--line);border-radius:14px;padding:14px 16px;background:#fff;}
    .agency-h{display:flex;align-items:center;gap:12px;}
    .agency-logo{width:44px;height:44px;border-radius:50%;object-fit:cover;background:var(--line);}
    .agency-logo-fallback{width:44px;height:44px;border-radius:50%;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;}
    .agency-name{font-weight:700;font-size:15px;}
    .agency-co{font-size:12.5px;color:var(--muted);margin-top:2px;}
    .agency-co b{color:var(--brand);}
    .agency-c{display:flex;flex-wrap:wrap;gap:6px 16px;margin-top:10px;font-size:13px;color:var(--muted);border-top:1px dashed var(--line);padding-top:10px;}
    .c-item b{display:inline-block;min-width:44px;color:var(--ink);font-weight:600;margin-right:4px;}
    .foot{text-align:center;color:var(--muted);font-size:12px;margin-top:20px;}
    .foot a{color:var(--brand-600);text-decoration:none;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand"><span class="dot"></span><b>PandaKing9</b> · 定制旅行</div>
    <div class="card">
      ${data.cover ? `<img class="cover" src="${esc(cover)}" alt="${title}" />` : ''}
      <h1>${title}</h1>
      ${metaHtml}
      ${highlightsHtml}
      ${descBody}
      ${daysHtml ? `<h3>行程安排</h3>${daysHtml}` : ''}
      ${agencyHtml}
    </div>
    <div class="foot"><a href="${esc(origin)}/#/cases">查看 PandaKing9 更多案例</a> · 入境游定制旅行</div>
  </div>
</body>
</html>`
}

export function renderCaseOgError(shareUrl: string, coverUrl: string): string {
  const title = '案例不存在或未发布 · PandaKing9'
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="该案例不存在或未发布" />
  <meta property="og:image" content="${esc(coverUrl)}" />
  <meta property="og:url" content="${esc(shareUrl)}" />
  <style>body{font-family:-apple-system,"PingFang SC",sans-serif;background:#f4f6fa;color:#1c2430;display:flex;min-height:100vh;align-items:center;justify-content:center;} .box{background:#fff;border-radius:16px;padding:32px 28px;text-align:center;box-shadow:0 6px 20px rgba(20,32,51,.08);max-width:320px;} h1{font-size:18px;margin-bottom:8px;} p{color:#76819a;font-size:14px;}</style>
</head>
<body><div class="box"><h1>案例不存在或未发布</h1><p>该案例可能已下线，请返回 PandaKing9 案例中心查看。</p></div></body>
</html>`
}
