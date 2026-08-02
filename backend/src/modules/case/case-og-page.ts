// 案例 OG 分享页（服务端渲染，带 OG 注入）
// 微信/社交爬虫不执行 JS，故分享卡片所需的 og:* 必须由服务端在 HTML 中写死。
// 该页自包含（无 SPA 依赖）：
//   - 爬虫抓取 → 拿 og:title/og:description/og:image/twitter:card/JSON-LD 生成分享卡片（始终中文，爬虫不跑 JS）
//   - 真实客户直接打开 → 看到完整案例（封面/标题/亮点/描述/每日行程/微站/联合品牌条）
// 多语言：标题/描述/亮点/每日行程生成 zh/en/th 三套文本块（非当前语言 display:none，SEO 与无 JS 回落中文）；
//   微站（contentHtml）体积可能很大，zh 直接内联 srcdoc（与前端 CaseHtmlView 一致：REVEAL_FIX + RESIZE_SCRIPT），
//   en/th 走按需接口 /share/case/:id/html?lang= 拉取后替换 iframe srcdoc，缺译回落 zh。
// 默认语言 = navigator.language（zh→中、th→泰、其余兜底英文），并支持 ?lang= 手动覆盖。

// 微站渲染关键脚本：强制渐显可见（修复 sanitize 剥 script 后 opacity:0 区块卡死）+ 自动高度 postMessage
const REVEAL_FIX =
  '<style>.reveal,.fade-in,.fadeIn,.anim,.animate,[class*="reveal"]{opacity:1!important;transform:none!important;visibility:visible!important;transition:none!important}</style>'
const RESIZE_SCRIPT =
  '<script>(function(){function p(){try{parent.postMessage({__caseHtmlHeight:document.documentElement.scrollHeight},"*");}catch(e){}}window.addEventListener("load",function(){p();setTimeout(p,300);setTimeout(p,1000);});if(window.MutationObserver){try{var o=new MutationObserver(function(){p();});o.observe(document.body,{childList:true,subtree:true,attributes:true});}catch(e){}}window.addEventListener("resize",p);})();</script>'

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 属性上下文转义（srcdoc 属性值）：转义 & 与 "（双层解码安全，见下方说明）
function attrEsc(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function fmtDate(iso?: unknown): string {
  if (!iso) return ''
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
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

type Lang = 'zh' | 'en' | 'th'
interface LangPart {
  lang: Lang
  html: string
}

// 生成多语言文本块：每个 lang 一个 [data-lang] 节点；非 zh 默认 display:none（无 JS / SEO 回落中文）
function langBlocks(tag: string, parts: LangPart[]): string {
  return parts
    .filter((p) => p.html && p.html.trim() !== '')
    .map((p) => {
      const hide = p.lang === 'zh' ? '' : ' style="display:none"'
      return `<${tag} class="lang-block" data-lang="${p.lang}"${hide}>${p.html}</${tag}>`
    })
    .join('')
}

function chipsHtml(arr?: string[] | null): string {
  const items = Array.isArray(arr) ? arr.filter(Boolean).map(esc) : []
  return items.length
    ? `<div class="chips">${items.map((h) => `<span class="chip">${h}</span>`).join('')}</div>`
    : ''
}

function buildDaysHtml(daysContent: unknown, origin: string): string {
  const days = Array.isArray(daysContent) ? daysContent : []
  if (!days.length) return ''
  return `<div class="days">${days
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
          <div class="day-h"><span class="day-no">第 ${esc(d?.day ?? '')} 天</span>${
            city ? `<span class="day-city">${city}</span>` : ''
          }</div>
          ${img ? `<img class="day-img" src="${esc(img)}" alt="${city}" loading="lazy" />` : ''}
          ${spots ? `<div class="line"><span class="k">景点</span>${spots}</div>` : ''}
          ${hotel ? `<div class="line"><span class="k">住宿</span>${hotel}</div>` : ''}
          ${meals ? `<div class="line"><span class="k">餐饮</span>${meals}</div>` : ''}
          ${notes ? `<div class="line"><span class="k">备注</span>${notes}</div>` : ''}
        </div>`
    })
    .join('')}</div>`
}

export interface CaseOgData {
  id: string
  title?: string | null
  titleEn?: string | null
  titleTh?: string | null
  destination: string
  days: number
  groupSize?: number | null
  travelDate?: string | Date | null
  vehicle?: string | null
  priceRange?: string | null
  cover?: string | null
  highlights?: string[]
  highlightsEn?: string[]
  highlightsTh?: string[]
  descZh?: string | null
  descEn?: string | null
  descTh?: string | null
  daysContent?: unknown
  daysContentEn?: unknown
  daysContentTh?: unknown
  contentHtml?: string | null
  contentHtmlEn?: string | null
  contentHtmlTh?: string | null
  agency?: { name: string; logoUrl?: string | null; contacts?: unknown } | null
}

export function renderCaseOgPage(
  data: CaseOgData,
  shareUrl: string,
  origin: string,
): string {
  const titleZh = esc(data.title?.trim() || data.destination || 'PandaKing9 定制案例')
  // 底部落款机构：联合品牌（?via=agencyId）时显示该机构名，否则回落 PandaKing9
  const orgName = data.agency?.name || 'PandaKing9'

  // OG 描述（始终中文）：descZh 前 200 字；无则用亮点标签拼接兜底；联合品牌落款追加在结尾
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

  // 多语言文本块
  const titleBlock = langBlocks('h1', [
    { lang: 'zh', html: titleZh },
    { lang: 'en', html: esc(data.titleEn?.trim() || '') },
    { lang: 'th', html: esc(data.titleTh?.trim() || '') },
  ])

  const highlightsBlock = langBlocks('div', [
    { lang: 'zh', html: chipsHtml(data.highlights) },
    { lang: 'en', html: chipsHtml(data.highlightsEn) },
    { lang: 'th', html: chipsHtml(data.highlightsTh) },
  ])

  const descBlock = langBlocks('div', [
    { lang: 'zh', html: data.descZh ? `<div class="desc">${esc(data.descZh)}</div>` : '' },
    { lang: 'en', html: data.descEn ? `<div class="desc">${esc(data.descEn)}</div>` : '' },
    { lang: 'th', html: data.descTh ? `<div class="desc">${esc(data.descTh)}</div>` : '' },
  ])

  const daysHeading = langBlocks('h3', [
    { lang: 'zh', html: '行程安排' },
    { lang: 'en', html: 'Itinerary' },
    { lang: 'th', html: 'กำหนดการเดินทาง' },
  ])

  const daysBlock = langBlocks('div', [
    { lang: 'zh', html: buildDaysHtml(data.daysContent, origin) },
    { lang: 'en', html: buildDaysHtml(data.daysContentEn, origin) },
    { lang: 'th', html: buildDaysHtml(data.daysContentTh, origin) },
  ])

  // 微站（运营上传的单文件 HTML，服务端 sanitize-html 后存储，已净化）。
  // 用沙箱 iframe srcdoc 渲染：注入 REVEAL_FIX（强制渐显可见）+ RESIZE_SCRIPT（自动高度），与前端的 CaseHtmlView 一致。
  // 直接内联进同一文档会导致微站全局 <style> 污染父页、全屏/绝对布局在容器内错乱、渐显区块卡 opacity:0 —— 故改用 iframe。
  // zh 内联 srcdoc（无需 fetch，首屏即见）；en/th 由前端 JS 走 /html?lang= 按需拉取。
  const zhMicroSrcdoc = attrEsc(REVEAL_FIX + (data.contentHtml || '') + RESIZE_SCRIPT)
  const microFrame = data.contentHtml
    ? `<div class="microsite-wrap"><iframe id="microsite" class="microsite-frame" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" srcdoc="${zhMicroSrcdoc}"></iframe></div>`
    : ''

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
  <title>${titleZh} | PandaKing9</title>
  <meta name="description" content="${esc(desc.replace(/\n/g, ' '))}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${titleZh}" />
  <meta property="og:description" content="${esc(desc.replace(/\n/g, ' '))}" />
  <meta property="og:image" content="${esc(cover)}" />
  <meta property="og:url" content="${esc(shareUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${titleZh}" />
  <meta name="twitter:description" content="${esc(desc.replace(/\n/g, ' '))}" />
  <meta name="twitter:image" content="${esc(cover)}" />
  <script type="application/ld+json">${ld}</script>
  <style>
    :root{--brand:#c8102e;--brand-600:#a60d26;--ink:#1c2430;--muted:#76819a;--line:#e8edf4;--bg:#f4f6fa;--card:#fff;}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased;}
    .wrap{max-width:520px;margin:0 auto;padding:0 16px 40px;}
    .lang-bar{position:sticky;top:0;z-index:20;display:flex;gap:6px;justify-content:center;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:8px;margin:0 -16px 10px;border-radius:0 0 14px 14px;box-shadow:0 2px 10px rgba(20,32,51,.06);}
    .lang-bar button{font:inherit;font-size:13px;font-weight:600;border:1px solid var(--line);background:#fff;color:var(--muted);padding:6px 13px;border-radius:999px;cursor:pointer;transition:all .2s cubic-bezier(.16,1,.3,1);}
    .lang-bar button:hover{color:var(--brand-600);border-color:var(--brand-600);}
    .lang-bar button.active{background:var(--brand);border-color:var(--brand);color:#fff;box-shadow:0 4px 12px rgba(200,16,46,.28);}
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
    .microsite-wrap{margin-top:16px;}
    .microsite-frame{width:100%;border:0;display:block;border-radius:14px;min-height:200px;background:transparent;overflow:hidden;}
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
    <div class="lang-bar" id="langBar">
      <button type="button" data-lang-btn="zh">中文</button>
      <button type="button" data-lang-btn="en">English</button>
      <button type="button" data-lang-btn="th">ไทย</button>
    </div>
    <div class="brand"><span class="dot"></span><b>PandaKing9</b> · 定制旅行</div>
    <div class="card">
      ${data.cover ? `<img class="cover" src="${esc(cover)}" alt="${titleZh}" />` : ''}
      <div class="lang-section">${titleBlock}</div>
      ${metaHtml}
      <div class="lang-section">${highlightsBlock}</div>
      <div class="lang-section">${descBlock}</div>
      ${microFrame}
      <div class="lang-section">${daysHeading}</div>
      <div class="lang-section">${daysBlock}</div>
      ${agencyHtml}
    </div>
    <div class="foot">${esc(orgName)} · 入境游定制旅行</div>
  </div>
  <script>
  (function(){
    var caseId = ${JSON.stringify(data.id)};
    var REVEAL_FIX = ${JSON.stringify(REVEAL_FIX).replace(/<\//g, '<\\/')};
    var RESIZE_SCRIPT = ${JSON.stringify(RESIZE_SCRIPT).replace(/<\//g, '<\\/')};
    var micro = document.getElementById('microsite');
    var zhSrcdoc = micro ? micro.getAttribute('srcdoc') : '';
    function setMicroLang(lang){
      if(!micro) return;
      if(lang === 'zh'){ micro.srcdoc = zhSrcdoc; return; }
      fetch('/share/case/' + caseId + '/html?lang=' + lang, {cache:'no-store'})
        .then(function(r){ if(!r.ok) throw new Error('nf'); return r.text(); })
        .then(function(html){ var h=(html||'').trim(); if(!h){ micro.srcdoc = zhSrcdoc; return; } micro.srcdoc = REVEAL_FIX + h + RESIZE_SCRIPT; })
        .catch(function(){ /* 保留当前微站（缺译回落 zh） */ });
    }
    function applyLang(lang){
      var secs = document.querySelectorAll('.lang-section');
      for(var i=0;i<secs.length;i++){
        var sec = secs[i];
        var blocks = sec.querySelectorAll(':scope > [data-lang]');
        var target = sec.querySelector(':scope > [data-lang="' + lang + '"]');
        var fb = sec.querySelector(':scope > [data-lang="zh"]');
        for(var j=0;j<blocks.length;j++){ blocks[j].style.display='none'; }
        if(target) target.style.display='';
        else if(fb) fb.style.display='';
      }
      var btns = document.querySelectorAll('[data-lang-btn]');
      for(var k=0;k<btns.length;k++){ btns[k].classList.toggle('active', btns[k].getAttribute('data-lang-btn') === lang); }
      document.documentElement.lang = (lang === 'zh') ? 'zh-CN' : (lang === 'th') ? 'th' : 'en';
      setMicroLang(lang);
    }
    function detectLang(){
      var q = location.search.match(/[?&]lang=(zh|en|th)/i);
      if(q) return q[1].toLowerCase();
      var nav = (navigator.language || 'en').toLowerCase();
      if(nav.indexOf('zh') === 0) return 'zh';
      if(nav.indexOf('th') === 0) return 'th';
      return 'en';
    }
    window.addEventListener('message', function(e){
      var d = e.data;
      if(d && d.__caseHtmlHeight && micro){
        var h = Math.max(200, Math.min(100000, d.__caseHtmlHeight));
        micro.style.height = h + 'px';
      }
    });
    var initLang = detectLang();
    applyLang(initLang);
    var bar = document.getElementById('langBar');
    if(bar){
      bar.addEventListener('click', function(e){
        var b = e.target.closest('[data-lang-btn]');
        if(b){ applyLang(b.getAttribute('data-lang-btn')); }
      });
    }
  })();
  </script>
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
