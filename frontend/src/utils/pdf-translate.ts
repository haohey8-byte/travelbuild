import type { PdfLang } from './pdf-i18n'

// 翻译服务接入点（可插拔）。
// 配置方式：在前端 .env 设置 VITE_TMT_ENDPOINT 指向你的翻译代理，
// 代理约定：POST { text: string, target: 'th' | 'en' } -> { translated: string }
// 未配置时：正文保留原文（中文），配合「双语」版也会显示中文，符合 PRD MVP 预期。
const ENDPOINT = ((import.meta.env as Record<string, unknown>).VITE_TMT_ENDPOINT as string | undefined) || ''

export function targetOf(lang: PdfLang): 'th' | 'en' | null {
  if (lang === 'th') return 'th'
  if (lang === 'en') return 'en'
  if (lang === 'bilingual') return 'th' // 双语对照的外文为泰语
  return null
}

export async function translateText(text: string, target: 'th' | 'en'): Promise<string> {
  if (!text || !text.trim()) return text
  if (!ENDPOINT) return text
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, target }),
    })
    if (!r.ok) return text
    const j = (await r.json()) as { translated?: string; text?: string; result?: string }
    const out = j.translated ?? j.text ?? j.result
    return typeof out === 'string' && out.trim() ? out : text
  } catch {
    return text
  }
}

// 批量翻译同一字段列表（保留顺序）；无翻译服务时同步返回原文。
export async function translateList(list: string[], target: 'th' | 'en' | null): Promise<string[]> {
  if (!target) return list
  return Promise.all(list.map((s) => translateText(s, target)))
}

export function translateEnabled(): boolean {
  return !!ENDPOINT
}
