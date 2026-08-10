// 联系方式自由列表工具（与后端 case.service.normalizeContacts 逻辑保持一致）
// 存储结构：Agency.contacts = [{ platform, value }, ...]
// 旧格式兼容：读取到对象 {platform: value} 时自动转数组
import type { ContactItem } from '@/types'

export const PLATFORM_LABELS: Record<string, string> = {
  line: 'LINE',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  wechat: '微信',
  phone: '电话',
  email: '邮箱',
}

/** 兼容旧格式（对象）与现格式（数组），统一输出数组；幂等，空值过滤。 */
export function normalizeContacts(raw: unknown): ContactItem[] {
  if (!raw) return []
  if (Array.isArray(raw)) {
    return raw.filter(
      (it): it is ContactItem =>
        !!it &&
        typeof it.platform === 'string' &&
        typeof it.value === 'string' &&
        it.value.trim() !== '',
    )
  }
  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => typeof v === 'string' && v.trim() !== '')
      .map(([platform, value]) => ({ platform, value: String(value).trim() }))
  }
  return []
}

export function contactLabel(p: string): string {
  return PLATFORM_LABELS[p] || (p ? p[0].toUpperCase() + p.slice(1) : p)
}

/** 展示层统一视图：把平台映射为可渲染形态（href / copyable） */
export interface ContactView {
  platform: string
  label: string
  value: string
  href?: string // wa.me / facebook / tel / mailto
  copyable?: boolean // line / wechat 显示复制按钮
}

export function contactViews(raw: unknown): ContactView[] {
  return normalizeContacts(raw).map((it) => {
    const p = String(it.platform).toLowerCase()
    const v = String(it.value)
    const base: ContactView = { platform: p, label: contactLabel(p), value: v }
    if (p === 'whatsapp') {
      const digits = v.replace(/[^\d]/g, '')
      if (digits) base.href = `https://wa.me/${digits}`
    } else if (p === 'facebook') {
      base.href = /^https?:\/\//.test(v) ? v : `https://${v}`
    } else if (p === 'phone') {
      base.href = `tel:${v}`
    } else if (p === 'email') {
      base.href = `mailto:${v}`
    } else if (p === 'line' || p === 'wechat') {
      base.copyable = true
    }
    return base
  })
}
