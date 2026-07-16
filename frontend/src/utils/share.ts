// 协作 H5 分享链接构造
// 分享页由后端服务端渲染（/share/route/:token，带 OG 注入），部署在后端域名下。
// 因此分享链接必须指向「后端域名」而非前端静态托管域名（前端域名的 hash 路由无法被爬虫解析 token）。
import { safeName, safeText } from '@/utils/name'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
const API_ORIGIN = API_BASE.replace(/\/api$/, '')

export function shareH5Url(token: string): string {
  return `${API_ORIGIN}/share/route/${token}`
}

// 邀请 H5 链接：指向前端 SPA 的邀请接受页（hash 路由），由邀请人复制后粘贴到微信群。
// 与协作分享链接不同，邀请页是交互式（需填名称+授权），因此走前端域名。
export function inviteH5Url(token: string): string {
  const base = window.location.origin + (import.meta.env.VITE_BASE || '/')
  return `${base}#/h5/invite/${token}`
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
export function shareH5Caption(route?: {
  customerNameCn?: string | null
  customerName?: string | null
  destination?: string | null
}): string {
  const who = safeName(route?.customerNameCn, route?.customerName)
  const dest = safeText(route?.destination)
  if (who && dest) return `${who} · ${dest} 定制行程报价`
  if (who) return `${who} 定制行程报价`
  if (dest) return `${dest} 定制行程报价`
  return '定制行程报价方案'
}

// 统一协作通知文案构造：覆盖「规划提交（方案更新）」与「反馈意见」两类事件。
// 两种事件都生成可直接粘贴到微信群的「主题 + 结构化信息 + H5 链接」文案。
export type CollabKind = 'plan' | 'feedback'

export interface CollabNotifyOpts {
  kind: CollabKind
  eventLabel: string // 事件名：生成协作H5 / 回传反馈 / 修订重交 / 发报价 v1 / 游客确认 / 付款成单 …
  subject?: string | null // 主题（客户名）
  destination?: string | null // 目的地
  authorName?: string | null // 操作人/提交方
  detail?: string | null // 反馈建议/备注（可选）
  url: string // 协作 H5 链接
}

function buildNotify(tag: string, head: string, bodyLines: string[], url: string): string {
  return ['【行程协作·' + tag + '】' + (head || '定制行程'), '', ...bodyLines, '', '👉 查看并回复：' + url].join('\n')
}

export function collabNotifyText(opts: CollabNotifyOpts): string {
  const head = [safeText(opts.subject), safeText(opts.destination)].filter(Boolean).join(' · ')
  const actor = opts.authorName ? opts.authorName + ' ' : ''
  const lines = [`${actor}${opts.eventLabel}`]
  if (opts.detail) lines.push(`「${opts.detail}」`)
  return buildNotify(opts.kind === 'feedback' ? '反馈意见' : '方案更新', head, lines, opts.url)
}

// 角色中文标签（用于通知文案中标注操作方）
export function roleLabel(role?: string | null): string {
  if (role === 'pandaking') return '一手 PandaKing'
  if (role === 'agency') return '境外旅行社'
  if (role === 'provincial') return '省地接社'
  return safeText(role) || '协作方'
}

// 兼容旧调用：反馈提交后的「通知文案」：带主题 + 反馈建议 + H5 链接
export interface FeedbackNotifyOpts {
  label: string // '新反馈' | '旅行社回复'
  subject?: string | null // 主题（客户名）
  destination?: string | null // 目的地
  authorName?: string | null // 提交方名称
  suggestion: string // 反馈建议内容
  url: string // 协作 H5 链接
}
export function feedbackNotifyText(opts: FeedbackNotifyOpts): string {
  const head = [safeText(opts.subject), safeText(opts.destination)].filter(Boolean).join(' · ')
  const who = opts.authorName ? `${opts.authorName} 提交了修改意见：` : '修改意见：'
  return buildNotify(opts.label, head, [who, `「${opts.suggestion}」`], opts.url)
}

// 复制文本到剪贴板：优先 Clipboard API，非安全上下文退化到 execCommand
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 落到退化方案 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
