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
