// 协作 H5 分享页（服务端渲染，带 OG 注入）
// 微信/社交爬虫不执行 JS，故分享卡片所需的 og:* 必须由服务端在 HTML 中写死。
// 该页自包含（无 SPA 依赖），既供爬虫抓取预览，也供真实客户直接打开查看行程与报价。

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 客户名兜底：过滤乱码/替换符/西里尔，优先中文名
function safeCust(cn?: string | null, en?: string | null): string {
  const bad = /[�\uFFFD\u0400-\u04FF]/
  if (cn && !bad.test(cn) && cn.trim()) return cn.trim()
  if (en && !bad.test(en) && en.trim()) return en.trim()
  return ''
}

const STATUS_LABEL: Record<string, string> = {
  consulting: '咨询中',
  awaiting_pk_confirm: '待一手确认',
  awaiting_agency_revision: '待旅行社修订',
  awaiting_quote: '待报价',
  awaiting_feedback: '待反馈',
  awaiting_confirm: '待确认',
  confirmed: '已确认',
  lost: '已流失',
}

function fmtDate(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface H5PageData {
  token: string
  destination: string
  customerNameCn?: string | null
  customerName?: string | null
  groupSize: number
  travelDate: string | null
  version: string
  statusKey: string
  itinerary?: any
  guestPrice: number | null
}

export function renderH5Page(
  data: H5PageData,
  shareUrl: string,
  coverUrl: string,
): string {
  const dest = esc(data.destination || '定制行程')
  const cust = safeCust(data.customerNameCn, data.customerName)
  const who = cust ? `${cust}的` : ''
  const statusLabel = esc(STATUS_LABEL[data.statusKey] ?? data.statusKey)
  const priceText =
    data.guestPrice != null ? `¥${Number(data.guestPrice).toLocaleString()}` : ''
  const dateText = fmtDate(data.travelDate)
  const title = `${who}${dest}定制行程方案 | PandaKing9`
  const desc = [
    `PandaKing9 ${cust ? `为${cust}定制` : '为您定制'}的${dest}行程方案`,
    data.groupSize ? `${data.groupSize}人` : '',
    dateText ? `${dateText}出行` : '',
    priceText ? `对客总价 ${priceText}` : '',
  ]
    .filter(Boolean)
    .join('，')

  const days = Array.isArray(data.itinerary?.days) ? data.itinerary.days : []
  const daysHtml = days.length
    ? days
        .map((d: any, i: number) => {
          const spots = Array.isArray(d.spots)
            ? d.spots.filter(Boolean).map(esc).join('、')
            : ''
          const hotel = d.hotel ? esc(d.hotel) : ''
          const meals = Array.isArray(d.meals)
            ? d.meals.filter(Boolean).map(esc).join('、')
            : ''
          return `
          <div class="day">
            <div class="day-h"><span class="day-no">第 ${esc(d.day ?? i + 1)} 天</span><span class="day-city">${esc(d.city)}</span></div>
            ${spots ? `<div class="line"><span class="k">景点</span>${spots}</div>` : ''}
            ${hotel ? `<div class="line"><span class="k">住宿</span>${hotel}</div>` : ''}
            ${meals ? `<div class="line"><span class="k">餐饮</span>${meals}</div>` : ''}
          </div>`
        })
        .join('')
    : '<p class="muted">暂无行程详情</p>'

  const token = esc(data.token)

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>${title}</title>
  <meta name="description" content="${esc(desc)}" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${esc(who)}${esc(dest)}定制行程方案" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${esc(coverUrl)}" />
  <meta property="og:url" content="${esc(shareUrl)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(who)}${esc(dest)}定制行程方案" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${esc(coverUrl)}" />
  <style>
    :root{--brand:#c8102e;--brand-600:#a60d26;--ink:#1c2430;--muted:#76819a;--line:#e8edf4;--bg:#f4f6fa;--card:#fff;}
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased;}
    .wrap{max-width:480px;margin:0 auto;padding:16px 16px 40px;}
    .brand{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:13px;padding:6px 2px 12px;}
    .brand .dot{width:10px;height:10px;border-radius:50%;background:var(--brand);}
    .brand b{color:var(--brand);font-weight:700;}
    .card{background:var(--card);border-radius:16px;padding:20px;box-shadow:0 6px 20px rgba(20,32,51,.08);}
    h1{font-size:23px;margin:2px 0 12px;line-height:1.35;}
    .meta{display:flex;flex-wrap:wrap;gap:10px 16px;color:var(--muted);font-size:13px;margin-bottom:6px;}
    .meta b{color:var(--ink);font-weight:600;}
    .price{margin:14px 0;padding:14px 16px;background:#fdeef0;border-radius:12px;display:flex;align-items:baseline;justify-content:space-between;}
    .price .lab{color:var(--brand-600);font-size:14px;}
    .price .val{color:var(--brand);font-size:26px;font-weight:800;}
    h3{font-size:15px;margin:18px 0 6px;color:var(--ink);}
    .day{border-top:1px solid var(--line);padding:12px 0;}
    .day-h{display:flex;align-items:center;gap:10px;margin-bottom:4px;}
    .day-no{font-weight:700;color:var(--brand);font-size:14px;}
    .day-city{font-weight:600;font-size:15px;}
    .line{color:var(--ink);font-size:14px;margin:2px 0 2px 2px;}
    .line .k{display:inline-block;min-width:34px;color:var(--muted);font-size:12px;margin-right:6px;}
    .muted{color:var(--muted);}
    .fb{margin-top:20px;border-top:1px solid var(--line);padding-top:16px;}
    .fb h3{margin-top:0;}
    .fb input,.fb textarea{width:100%;margin:8px 0;padding:11px 12px;border:1px solid var(--line);border-radius:10px;font-size:14px;font-family:inherit;background:#fbfcfe;}
    .btn{width:100%;padding:13px;border:none;border-radius:11px;background:var(--brand);color:#fff;font-size:15px;font-weight:700;cursor:pointer;}
    .btn:disabled{opacity:.6;}
    .tip{font-size:13px;margin-top:10px;}
    .ok{color:var(--brand-600);font-weight:600;}
    .err{color:#d83a2e;}
    .foot{text-align:center;color:var(--muted);font-size:12px;margin-top:24px;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="brand"><span class="dot"></span><b>PandaKing9</b> · 入境游定制协作</div>
    <div class="card">
      <h1>${cust ? esc(cust) + ' · ' : ''}${dest}</h1>
      <div class="meta">
        <span>版本 <b>${esc(data.version)}</b></span>
        <span>状态 <b>${statusLabel}</b></span>
        <span>人数 <b>${data.groupSize || 1}</b></span>
        ${dateText ? `<span>出行 <b>${dateText}</b></span>` : ''}
      </div>
      ${priceText ? `<div class="price"><span class="lab">对客总价</span><span class="val">${priceText}</span></div>` : ''}
      <h3>行程安排</h3>
      ${daysHtml}
      <div class="fb">
        <h3>修改反馈</h3>
        <input id="author" placeholder="您的名称（可选）" />
        <textarea id="content" rows="4" placeholder="请输入您的修改意见…"></textarea>
        <button class="btn" id="send" onclick="sendFb()">提交反馈</button>
        <p class="tip" id="tip"></p>
      </div>
    </div>
    <div class="foot">本方案由 PandaKing9 一手定制 · 仅供受邀客户查看</div>
  </div>
  <script>
    function sendFb(){
      var c=document.getElementById('content').value.trim();
      var a=document.getElementById('author').value.trim();
      var tip=document.getElementById('tip');
      var btn=document.getElementById('send');
      if(!c){tip.className='tip err';tip.textContent='请填写反馈内容';return;}
      btn.disabled=true;btn.textContent='提交中…';
      fetch('/api/h5/route/${token}/feedback',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({content:c,authorName:a})
      }).then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j};});})
      .then(function(res){
        if(res.ok){tip.className='tip ok';tip.textContent='感谢反馈，已提交！';document.getElementById('content').value='';}
        else{throw new Error(res.j&&res.j.message||'提交失败');}
      }).catch(function(e){tip.className='tip err';tip.textContent=e.message||'提交失败';})
      .finally(function(){btn.disabled=false;btn.textContent='提交反馈';});
    }
  </script>
</body>
</html>`
}

export function renderH5Error(shareUrl: string, coverUrl: string): string {
  const title = '协作链接无效 · PandaKing9'
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="该协作链接无效或已过期" />
  <meta property="og:image" content="${esc(coverUrl)}" />
  <meta property="og:url" content="${esc(shareUrl)}" />
  <style>body{font-family:-apple-system,"PingFang SC",sans-serif;background:#f4f6fa;color:#1c2430;display:flex;min-height:100vh;align-items:center;justify-content:center;} .box{background:#fff;border-radius:16px;padding:32px 28px;text-align:center;box-shadow:0 6px 20px rgba(20,32,51,.08);max-width:320px;} h1{font-size:18px;margin-bottom:8px;} p{color:#76819a;font-size:14px;}</style>
</head>
<body><div class="box"><h1>协作链接无效或已过期</h1><p>请向您的顾问索取最新的方案链接。</p></div></body>
</html>`
}
