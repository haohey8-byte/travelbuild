// 协作 H5 分享链接构造
// 分享页由后端服务端渲染（/share/route/:token，带 OG 注入），部署在后端域名下。
// 因此分享链接必须指向「后端域名」而非前端静态托管域名（前端域名的 hash 路由无法被爬虫解析 token）。
import { safeName, safeText } from '@/utils/name'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:3000/api'
const API_ORIGIN = API_BASE.replace(/\/api$/, '')

export function shareH5Url(token: string): string {
  return `${API_ORIGIN}/share/route/${token}`
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

// 反馈提交后的「通知文案」：带主题 + 反馈建议 + H5 链接，便于粘贴到微信同步对端
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
  return [
    `【行程协作·${opts.label}】${head || '定制行程'}`,
    '',
    who,
    `「${opts.suggestion}」`,
    '',
    `👉 查看并回复：${opts.url}`,
  ].join('\n')
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
