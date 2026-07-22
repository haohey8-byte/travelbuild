// 协作 H5 分享链接构造
// 分享页由后端服务端渲染（/share/route/:token，带 OG 注入），部署在后端域名下。
// 因此分享链接必须指向「后端域名」而非前端静态托管域名（前端域名的 hash 路由无法被爬虫解析 token）。
import { safeName, safeText } from '@/utils/name'
import type { QuoteLevel, ProfitMode } from '@/types'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

// 从 VITE_API_BASE 解析后端 origin：
// - 若配置为绝对 URL（如 https://host/api），去掉 /api 得到 https://host
// - 若配置为相对路径（如 /api），则无法得知后端域名，回退为空字符串，
//   此时 shareH5Url 生成相对路径 /share/route/:token（仅开发期 Vite 代理可用）
function getApiOrigin(): string {
  try {
    const url = new URL(API_BASE, typeof window !== 'undefined' ? window.location.href : 'http://localhost')
    // 如果 API_BASE 是相对路径，new URL 会基于 window.location 拼接，但这不是我们想要的生产行为；
    // 因此只有 API_BASE 本身包含协议头时才信任解析出的 origin。
    if (API_BASE.startsWith('http://') || API_BASE.startsWith('https://')) {
      const origin = url.origin
      return origin.endsWith('/api') ? origin.slice(0, -4) : origin
    }
  } catch {
    /* ignore */
  }
  return ''
}

const API_ORIGIN = getApiOrigin()

export function shareH5Url(token: string): string {
  return `${API_ORIGIN}/share/route/${token}`
}

// 邀请 H5 链接：指向前端 SPA 的邀请接受页（hash 路由），由邀请人复制后粘贴到微信群。
// 与协作分享链接不同，邀请页是交互式（需填名称+授权），因此走前端域名。
export function inviteH5Url(token: string): string {
  const base = window.location.origin + (import.meta.env.VITE_BASE || '/')
  return `${base}#/h5/invite/${token}`
}

// 旅行社 H5 链接：指向前端 SPA 的协作页（hash 路由），与 shareH5Url（SSR 静态页）区分。
// 一手「生成对旅行社链接」使用此 URL：旅行社在微信里打开 SPA，可看行程 + 加利润② → 生成对客链接。
// 区别：shareH5Url 指向 SSR 页（仅对客总价、不可编辑，用于微信分享卡片 OG 预览）；
//      agencyH5Url 指向 SPA 页（可加利润②，旅行社交互入口）。
export function agencyH5Url(token: string): string {
  const base = window.location.origin + (import.meta.env.VITE_BASE || '/')
  return `${base}#/h5/route/${token}`
}

// 一手 PandaKing 协作 H5 链接：指向 SPA 协作页（hash 路由），与 agencyH5Url 同一组件（按 role 渲染不同权限）。
// PandaKing 凭此链接在微信/H5 内全量编辑行程与价格，与旅行社反复往返协作。
export function pandakingH5Url(token: string): string {
  const base = window.location.origin + (import.meta.env.VITE_BASE || '/')
  return `${base}#/h5/route/${token}`
}

// 成本询价 H5 链接：指向前端 SPA 的询价填写页（hash 路由），一手复制后发微信群给省地接社。
export function costInquiryH5Url(token: string): string {
  const base = window.location.origin + (import.meta.env.VITE_BASE || '/')
  return `${base}#/h5/cost-inquiry/${token}`
}

// 省地接社协作 H5 链接：指向前端 SPA 的协作编辑页（hash 路由），一手复制后发微信群给省地接社。
export function provincialRouteH5Url(token: string): string {
  const base = window.location.origin + (import.meta.env.VITE_BASE || '/')
  return `${base}#/h5/provincial-route/${token}`
}

// 复制分享链接时附带的「客户/路线说明标注」（微信粘贴即带说明 + 链接）
// 三段式标题：{客户} · {目的地} · {时间}，让 PandaKing 在微信群中一眼看清是谁、什么行程、什么时候出发
export function shareH5Caption(
  route?: {
    customerNameCn?: string | null
    customerName?: string | null
    destination?: string | null
    travelDate?: string | null
  },
  role?: 'agency' | 'provincial' | 'pk',
): string {
  const who = safeName(route?.customerNameCn, route?.customerName)
  const dest = safeText(route?.destination)
  const date = formatTravelDate(route?.travelDate)
  const head = [who, dest, date].filter(Boolean).join(' · ')
  // 标题后缀按角色区分：境外旅行社为「规划路线及报价」，省地接社/默认（含一手）为「规划路线审核及询价」
  const suffix = role === 'agency' ? '规划路线及报价' : '规划路线审核及询价'
  if (head) return `${head} ${suffix}`
  return `${suffix}方案`
}

// 出行日期格式化为「7月25日」等简短中文形式（兼容 ISO 与纯日期字符串）
function formatTravelDate(d?: string | null): string {
  if (!d) return ''
  const s = String(d).trim()
  if (!s) return ''
  const datePart = s.split('T')[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart
  const [, m, day] = datePart.split('-')
  return `${parseInt(m, 10)}月${parseInt(day, 10)}日`
}

// 统一协作通知文案构造：覆盖「规划提交（方案更新）」与「反馈意见」两类事件。
// 两种事件都生成可直接粘贴到微信群的「主题 + 结构化信息 + H5 链接」文案。
export type CollabKind = 'plan' | 'feedback'

// —— 省地接社↔一手多轮协作：回传时生成「关键变更摘要」——
// 现状：省地接社与一手就行程编辑与成本价格存在多轮反复沟通（非一次性回传），
// 因此每次回传的通知文案需自动汇总「修改了哪些价格 / 行程有哪些关键变更」，
// 让一手在微信里一眼看清本轮改动，无需逐页比对。
export type ChangeField = 'cost1' | 'profit1' | 'quoteA' | 'guestPrice' | 'profit2'
export interface ProvincialCostChange {
  name: string
  before: number
  after: number
  isNew: boolean // 本轮新增的成本项
  field?: ChangeField // 变更字段：成本① / 利润① / 报价A / 对客价 / 利润②（省地接社默认 cost1）
}
export interface ProvincialItineraryChange {
  dayCountBefore: number
  dayCountAfter: number
  dayDelta: number // 天数增减
  cityChanges: string[] // 人类可读的城市变更，如 "D3 大阪→京都" / "D5 东京(新增)"
}
export interface QuoteTotalsChange {
  cost1?: { before: number; after: number }
  profit1?: { before: number; after: number }
  quoteA?: { before: number; after: number }
  profit2?: { before: number; after: number; mode?: ProfitMode }
  guestPrice?: { before: number; after: number }
}
export interface ProvincialChanges {
  versionLabel?: string // 基于的版本号，如 "v2"
  cost?: {
    totalBefore: number
    totalAfter: number
    items: ProvincialCostChange[]
  }
  totals?: QuoteTotalsChange
  itinerary?: ProvincialItineraryChange
}

export interface CollabNotifyOpts {
  kind: CollabKind
  eventLabel: string // 事件名：生成协作H5 / 回传反馈 / 修订重交 / 发报价 v1 / 游客确认 / 付款成单 …
  subject?: string | null // 主题（客户名）
  destination?: string | null // 目的地
  travelDate?: string | null // 出行日期（拼进标题，便于一眼看清出发时间）
  authorName?: string | null // 操作人/提交方
  detail?: string | null // 反馈建议/备注（可选，保留兼容）
  changes?: ProvincialChanges // 本轮关键变更摘要（省地接社多轮回传时填充）
  url: string // 协作 H5 链接
}

// 计算省地接社本轮回传的变更摘要：成本①（价格差异）+ 行程（天数/城市变更）
export function diffProvincialChanges(opts: {
  beforeItems: { name: string; cost1: number }[]
  afterItems: { name: string; cost1: number }[]
  beforeItinerary?: { days: { day: number; city: string }[] }
  afterItinerary?: { days: { day: number; city: string }[] }
  versionLabel?: string
}): ProvincialChanges {
  const changes: ProvincialChanges = {}
  if (opts.versionLabel) changes.versionLabel = opts.versionLabel

  // 成本①差异：按名称对齐，before/after 不同即视为变更
  const beforeMap = new Map(opts.beforeItems.map((i) => [String(i.name).trim(), Number(i.cost1) || 0]))
  const afterMap = new Map(opts.afterItems.map((i) => [String(i.name).trim(), Number(i.cost1) || 0]))
  const allNames = Array.from(new Set([...beforeMap.keys(), ...afterMap.keys()]))
  const costItems: ProvincialCostChange[] = []
  for (const name of allNames) {
    const before = beforeMap.get(name) ?? 0
    const after = afterMap.get(name) ?? 0
    if (before === after) continue
    costItems.push({ name, before, after, isNew: before === 0 })
  }
  if (costItems.length > 0 || opts.afterItems.length > 0) {
    changes.cost = {
      totalBefore: opts.beforeItems.reduce((s, i) => s + (Number(i.cost1) || 0), 0),
      totalAfter: opts.afterItems.reduce((s, i) => s + (Number(i.cost1) || 0), 0),
      items: costItems,
    }
  }

  // 行程差异：逐天比对城市，输出 Dn 的新增/移除/变更
  if (opts.beforeItinerary && opts.afterItinerary) {
    const bDays = opts.beforeItinerary.days || []
    const aDays = opts.afterItinerary.days || []
    const cityChanges: string[] = []
    const maxLen = Math.max(bDays.length, aDays.length)
    for (let i = 0; i < maxLen; i++) {
      const d = i + 1
      const b = bDays[i]
      const a = aDays[i]
      const bCity = (b?.city || '').trim()
      const aCity = (a?.city || '').trim()
      if (!b && a) cityChanges.push(`D${d} ${aCity || '（空白）'}(新增)`)
      else if (b && !a) cityChanges.push(`D${d} ${bCity}(移除)`)
      else if (bCity !== aCity) {
        if (!bCity) cityChanges.push(`D${d} ${aCity}(新增城市)`)
        else if (!aCity) cityChanges.push(`D${d} ${bCity}(清空城市)`)
        else cityChanges.push(`D${d} ${bCity}→${aCity}`)
      }
    }
    changes.itinerary = {
      dayCountBefore: bDays.length,
      dayCountAfter: aDays.length,
      dayDelta: aDays.length - bDays.length,
      cityChanges,
    }
  }
  return changes
}

// 字段中文标签（用于变更摘要与通知文案）
export function fieldLabel(f?: ChangeField): string {
  switch (f) {
    case 'cost1': return '成本①'
    case 'profit1': return '利润①'
    case 'quoteA': return '报价A'
    case 'guestPrice': return '对客价'
    case 'profit2': return '利润②'
    default: return '成本①'
  }
}

// 按角色可编辑域对比「报价/行程」变更（泛化 diffProvincialChanges）
//   editableFields 决定比哪些域：
//   - pandaking 全字段：cost1 + profit1 + itinerary
//   - agency     仅利润②：profit2 + itinerary
//   - provincial 成本①  ：cost1 + itinerary（见下方 diffProvincialChanges 薄壳）
export interface QuoteDiffInput {
  items?: QuoteLevel[]
  profit2Mode?: ProfitMode
  profit2?: number
  itinerary?: { days: { day: number; city: string }[] }
}
export function diffQuoteChanges(opts: {
  before: QuoteDiffInput
  after: QuoteDiffInput
  editableFields: ('cost1' | 'profit1' | 'profit2' | 'itinerary')[]
  versionLabel?: string
}): ProvincialChanges {
  const changes: ProvincialChanges = {}
  if (opts.versionLabel) changes.versionLabel = opts.versionLabel
  const fields = opts.editableFields

  // 报价项字段对比（cost1 / profit1）
  const itemFields = fields.filter((f): f is 'cost1' | 'profit1' => f === 'cost1' || f === 'profit1')
  if (itemFields.length) {
    const bItems = opts.before.items ?? []
    const aItems = opts.after.items ?? []
    const bMap = new Map(bItems.map((i) => [String(i.name).trim(), i]))
    const aMap = new Map(aItems.map((i) => [String(i.name).trim(), i]))
    const allNames = Array.from(new Set([...bMap.keys(), ...aMap.keys()]))
    const items: ProvincialCostChange[] = []
    for (const name of allNames) {
      const b = bMap.get(name)
      const a = aMap.get(name)
      for (const f of itemFields) {
        const before = b ? Number((b as Record<string, unknown>)[f]) || 0 : 0
        const after = a ? Number((a as Record<string, unknown>)[f]) || 0 : 0
        if (before === after) continue
        items.push({ name, field: f, before, after, isNew: !b && !!a })
      }
    }
    if (items.length > 0) {
      changes.cost = {
        totalBefore: items.reduce((s, i) => s + i.before, 0),
        totalAfter: items.reduce((s, i) => s + i.after, 0),
        items,
      }
    }
    // 汇总各字段合计到 totals（供文案与摘要按字段展示）
    const totals: QuoteTotalsChange = {}
    for (const f of itemFields) {
      const before = bItems.reduce((s, i) => s + (Number((i as Record<string, unknown>)[f]) || 0), 0)
      const after = aItems.reduce((s, i) => s + (Number((i as Record<string, unknown>)[f]) || 0), 0)
      if (before !== after) (totals as Record<string, unknown>)[f] = { before, after }
    }
    if (Object.keys(totals).length) changes.totals = totals
  }

  // 利润②（境外旅行社）
  if (fields.includes('profit2')) {
    const before = Number(opts.before.profit2) || 0
    const after = Number(opts.after.profit2) || 0
    if (before !== after) {
      changes.totals = changes.totals || {}
      changes.totals.profit2 = { before, after, mode: opts.after.profit2Mode }
    }
  }

  // 行程差异
  if (fields.includes('itinerary')) {
    const bDays = opts.before.itinerary?.days ?? []
    const aDays = opts.after.itinerary?.days ?? []
    const cityChanges: string[] = []
    const maxLen = Math.max(bDays.length, aDays.length)
    for (let i = 0; i < maxLen; i++) {
      const d = i + 1
      const b = bDays[i]
      const a = aDays[i]
      const bCity = (b?.city || '').trim()
      const aCity = (a?.city || '').trim()
      if (!b && a) cityChanges.push(`D${d} ${aCity || '（空白）'}(新增)`)
      else if (b && !a) cityChanges.push(`D${d} ${bCity}(移除)`)
      else if (bCity !== aCity) {
        if (!bCity) cityChanges.push(`D${d} ${aCity}(新增城市)`)
        else if (!aCity) cityChanges.push(`D${d} ${bCity}(清空城市)`)
        else cityChanges.push(`D${d} ${bCity}→${aCity}`)
      }
    }
    changes.itinerary = {
      dayCountBefore: bDays.length,
      dayCountAfter: aDays.length,
      dayDelta: aDays.length - bDays.length,
      cityChanges,
    }
  }

  return changes
}

// 把变更摘要结构渲染为「【本轮变更摘要】」文本（页面展示 + 反馈记录复用）
export function formatQuoteChanges(ch: ProvincialChanges): string {
  if (!ch) return ''
  const lines: string[] = ['【本轮变更摘要】']
  if (ch.cost && ch.cost.items.length > 0) {
    const groups = new Map<ChangeField, ProvincialCostChange[]>()
    for (const it of ch.cost.items) {
      const f = (it.field as ChangeField) || 'cost1'
      if (!groups.has(f)) groups.set(f, [])
      groups.get(f)!.push(it)
    }
    for (const [f, items] of groups) {
      const totalBefore = items.reduce((s, it) => s + (it.before || 0), 0)
      const totalAfter = items.reduce((s, it) => s + (it.after || 0), 0)
      const sign = totalAfter - totalBefore >= 0 ? '+' : ''
      lines.push(`${fieldLabel(f)} 合计：¥${totalBefore.toLocaleString()} → ¥${totalAfter.toLocaleString()} (${sign}¥${(totalAfter - totalBefore).toLocaleString()})`)
      for (const it of items.slice(0, 10)) {
        if (it.isNew) lines.push(`  + ${it.name}：¥${it.after.toLocaleString()}(新增)`)
        else lines.push(`  · ${it.name}：¥${it.before.toLocaleString()} → ¥${it.after.toLocaleString()}`)
      }
    }
  }
  if (ch.totals?.profit2) {
    const p = ch.totals.profit2
    lines.push(`利润②：${Math.round(p.before).toLocaleString()} → ${Math.round(p.after).toLocaleString()}${p.mode === 'percent' ? '%' : ''}`)
  }
  if (ch.itinerary && ch.itinerary.cityChanges.length > 0) {
    const dayDelta = ch.itinerary.dayDelta
    const daysText = dayDelta !== 0
      ? `（天数：${ch.itinerary.dayCountBefore}天 → ${ch.itinerary.dayCountAfter}天${dayDelta > 0 ? `，+${dayDelta}` : dayDelta}天）`
      : ''
    lines.push(`行程调整${daysText}`)
    for (const c of ch.itinerary.cityChanges.slice(0, 15)) lines.push(`  ${c}`)
  }
  return lines.join('\n')
}

function buildNotify(tag: string, head: string, bodyLines: string[], url: string): string {
  return ['【行程协作·' + tag + '】' + (head || '规划路线审核及询价'), '', ...bodyLines, '', '👉 查看并回复：' + url].join('\n')
}

export function collabNotifyText(opts: CollabNotifyOpts): string {
  const head = [safeText(opts.subject), safeText(opts.destination), formatTravelDate(opts.travelDate)].filter(Boolean).join(' · ')
  const actor = opts.authorName ? opts.authorName + ' ' : ''
  const lines = [`${actor}${opts.eventLabel}`]
  if (opts.detail) lines.push(`「${opts.detail}」`)

  // 关键变更摘要块：仅在确有变更时展示，避免无变化时出现空标题
  const blocks: string[] = []
  const ch = opts.changes
  if (ch) {
    const sub: string[] = []
    if (ch.versionLabel) sub.push(`基于 ${ch.versionLabel}`)
    // 成本/利润明细（按字段分组：成本① / 利润① / 报价A / 对客价）
    if (ch.cost && ch.cost.items.length > 0) {
      const groups = new Map<ChangeField, ProvincialCostChange[]>()
      for (const it of ch.cost.items) {
        const f = (it.field as ChangeField) || 'cost1'
        if (!groups.has(f)) groups.set(f, [])
        groups.get(f)!.push(it)
      }
      for (const [f, items] of groups) {
        const totalBefore = items.reduce((s, it) => s + (it.before || 0), 0)
        const totalAfter = items.reduce((s, it) => s + (it.after || 0), 0)
        sub.push(`${fieldLabel(f)} 合计 ¥${totalBefore.toLocaleString()} → ¥${totalAfter.toLocaleString()}（${items.length}项变更）`)
        for (const it of items.slice(0, 8)) {
          if (it.isNew) sub.push(`• ${it.name}(新增)：¥${it.after.toLocaleString()}`)
          else sub.push(`• ${it.name}：¥${it.before.toLocaleString()} → ¥${it.after.toLocaleString()}`)
        }
      }
    }
    // 利润②（境外旅行社单独成块）
    if (ch.totals?.profit2) {
      const p = ch.totals.profit2
      sub.push(`利润② 合计 ¥${Math.round(p.before).toLocaleString()} → ¥${Math.round(p.after).toLocaleString()}${p.mode === 'percent' ? '(%)' : ''}（本次调整）`)
    }
    if (ch.itinerary && ch.itinerary.cityChanges.length > 0) {
      sub.push(`行程：${ch.itinerary.dayCountBefore} → ${ch.itinerary.dayCountAfter} 天`)
      for (const c of ch.itinerary.cityChanges.slice(0, 8)) sub.push(`• ${c}`)
    }
    // 仅当除版本标签外还有实质变更时才展示块
    if (sub.length > (ch.versionLabel ? 1 : 0)) blocks.push(...sub)
  }

  const bodyLines = blocks.length ? [...lines, '', '【本轮关键变更】', ...blocks] : lines
  return buildNotify(opts.kind === 'feedback' ? '反馈意见' : '方案更新', head, bodyLines, opts.url)
}

// 角色中文标签（用于通知文案中标注操作方）
export function roleLabel(role?: string | null): string {
  if (role === 'pandaking') return 'PandaKing'
  if (role === 'agency') return '境外旅行社'
  if (role === 'provincial') return '省地接社'
  return safeText(role) || '协作方'
}

// 兼容旧调用：反馈提交后的「通知文案」：带主题 + 反馈建议 + H5 链接
export interface FeedbackNotifyOpts {
  label: string // '新反馈' | '旅行社回复'
  subject?: string | null // 主题（客户名）
  destination?: string | null // 目的地
  travelDate?: string | null // 出行日期（拼进标题）
  authorName?: string | null // 提交方名称
  suggestion: string // 反馈建议内容
  url: string // 协作 H5 链接
}
export function feedbackNotifyText(opts: FeedbackNotifyOpts): string {
  const head = [safeText(opts.subject), safeText(opts.destination), formatTravelDate(opts.travelDate)].filter(Boolean).join(' · ')
  const who = opts.authorName ? `${opts.authorName} 提交了修改意见：` : '修改意见：'
  return buildNotify(opts.label, head, [who, `「${opts.suggestion}」`], opts.url)
}

// 复制文本到剪贴板：优先 Clipboard API，非安全上下文（微信/iOS 内嵌浏览器等）退化到 execCommand。
// 两路都失败时返回 false，由调用方提示用户「长按上方文字手动复制」。
export async function copyText(text: string): Promise<boolean> {
  // 第一路：标准 Clipboard API（需安全上下文 + 用户手势；部分微信 webview 无此对象或静默失败）
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 落到退化方案 */
  }
  // 第二路：临时 textarea + execCommand（兼容 iOS/微信）。
  // iOS Safari/微信需显式 setSelectionRange + Range，否则 ta.select() 不生效。
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '0'
    ta.style.left = '0'
    ta.style.width = '1px'
    ta.style.height = '1px'
    ta.style.padding = '0'
    ta.style.border = 'none'
    ta.style.opacity = '0'
    ta.style.zIndex = '-1'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    try {
      ta.setSelectionRange(0, text.length)
    } catch {
      /* 非受控，忽略 */
    }
    const sel = window.getSelection()
    if (sel) {
      const range = document.createRange()
      range.selectNodeContents(ta)
      sel.removeAllRanges()
      sel.addRange(range)
    }
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) return true
  } catch {
    /* 忽略，继续返回 false */
  }
  return false
}
