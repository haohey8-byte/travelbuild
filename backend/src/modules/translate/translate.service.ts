import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import * as HTMLParserNs from 'node-html-parser'
import { tmtTranslate } from './tmt.translator'

const HTMLParser = (HTMLParserNs as any).default ?? HTMLParserNs

interface DayContent {
  day?: number
  city?: string
  spots?: string[]
  hotel?: string
  meals?: string[]
  notes?: string
  image?: string | null
}

// 翻译服务：腾讯云机器翻译 TMT（env: TMT_SECRET_ID / TMT_SECRET_KEY / TMT_REGION 可选）
// 未配置密钥时抛「翻译服务未配置」，由调用方决定是否静默降级（发布自动补翻失败不影响发布）
@Injectable()
export class TranslateService {
  private readonly logger = new Logger(TranslateService.name)

  /** 中文 → 目标语种（en/th） */
  async translateZh(text: string, target: 'en' | 'th'): Promise<string> {
    const sid = process.env.TMT_SECRET_ID
    const skey = process.env.TMT_SECRET_KEY
    if (!sid || !skey) {
      throw new Error('翻译服务未配置：缺少 TMT_SECRET_ID/TMT_SECRET_KEY')
    }
    const out = await tmtTranslate(
      { secretId: sid, secretKey: skey, region: process.env.TMT_REGION || 'ap-guangzhou' },
      text,
      'zh',
      target,
    )
    this.logger.log(`tmt translate zh->${target} (${text.length} chars)`)
    return out
  }

  /** 字符串数组整体翻译（highlights 用），按出现顺序返回；过滤空字符串 */
  async translateArray(items: string[], target: 'en' | 'th'): Promise<string[]> {
    const out: string[] = []
    for (const v of items) {
      out.push(v && v.trim() ? await this.translateZh(v, target) : v)
    }
    return out
  }

  /** 每日图文多字段翻译：city/spots/hotel/meals/notes；保持原有结构与 image 字段 */
  async translateDaysContent(
    days: any[] | null | undefined,
    target: 'en' | 'th',
  ): Promise<any[] | null | undefined> {
    if (!Array.isArray(days)) return days
    const out: any[] = []
    for (const d of days) {
      const [city, hotel, notes] = await Promise.all([
        d.city ? this.translateZh(d.city, target) : Promise.resolve(d.city ?? ''),
        d.hotel ? this.translateZh(d.hotel, target) : Promise.resolve(d.hotel ?? ''),
        d.notes ? this.translateZh(d.notes, target) : Promise.resolve(d.notes ?? ''),
      ])
      const spots = Array.isArray(d.spots) ? await this.translateArray(d.spots, target) : d.spots
      const meals = Array.isArray(d.meals) ? await this.translateArray(d.meals, target) : d.meals
      out.push({ ...d, city, spots, hotel, meals, notes })
    }
    return out
  }

  /** DOM 级 HTML 翻译：解析 → 提取文本节点 + alt/title/aria-label/placeholder → 逐项 TMT → 写回；
   * 保留标签结构与 CSS class；script/style/noscript 内部文本跳过 */
  async translateHtmlContent(html: string, target: 'en' | 'th'): Promise<string> {
    if (!html || !html.trim()) return html
    const root = HTMLParser.parse(html)

    // 1. 收集文本节点（跳过 script/style/noscript 内部文本）
    const SKIP_PARENT = new Set(['script', 'style', 'noscript'])
    const TEXT_NODE_TYPE = 3
    const ELEMENT_NODE_TYPE = 1
    const textQueue: { node: any; original: string }[] = []
    const walk = (node: any) => {
      for (const child of node.childNodes || []) {
        const tn = child.nodeType
        if (tn === TEXT_NODE_TYPE && (child.text || '').trim()) {
          if (SKIP_PARENT.has((child.parentNode?.tagName || '').toLowerCase())) continue
          textQueue.push({ node: child, original: child.text })
        } else if (tn === ELEMENT_NODE_TYPE) {
          walk(child)
        }
      }
    }
    walk(root)

    // 2. 收集可翻译属性
    const TRANSLATABLE_ATTRS = ['alt', 'title', 'aria-label', 'placeholder']
    const attrQueue: { el: any; attr: string; original: string }[] = []
    for (const el of root.querySelectorAll('*')) {
      for (const a of TRANSLATABLE_ATTRS) {
        const v = el.getAttribute(a)
        if (v && v.trim()) attrQueue.push({ el, attr: a, original: v })
      }
    }

    this.logger.log(
      `translateHtmlContent: ${textQueue.length} text nodes + ${attrQueue.length} attrs (target=${target})`,
    )

    // 3. 逐项翻译（短文本，TMT 单节点 2000 字符内够用）
    // 收集失败节点，超过 0 立即 throw，把 TMT 错误原文抛给前端（避免静默半翻译）
    const failures: { kind: 'text' | 'attr'; original: string; err: string }[] = []
    for (const t of textQueue) {
      try {
        t.node.text = await this.translateZh(t.original, target)
      } catch (e: any) {
        const msg = e?.message || String(e)
        this.logger.warn(`text node translate fail: ${msg} | text=${t.original.slice(0, 60)}`)
        failures.push({ kind: 'text', original: t.original, err: msg })
      }
    }
    for (const a of attrQueue) {
      try {
        a.el.setAttribute(a.attr, await this.translateZh(a.original, target))
      } catch (e: any) {
        const msg = e?.message || String(e)
        this.logger.warn(`attr ${a.attr} translate fail: ${msg} | text=${a.original.slice(0, 60)}`)
        failures.push({ kind: 'attr', original: a.original, err: msg })
      }
    }
    if (failures.length) {
      // 取首条失败的具体错误（多数情况是同一个 TMT 权限/网络问题），便于用户自查
      const first = failures[0]
      const sample = first.original.length > 40 ? first.original.slice(0, 40) + '…' : first.original
      throw new BadRequestException(
        `HTML 翻译失败 ${failures.length} 处（首处样本：${sample}）：${first.err}。请检查 TMT 密钥是否对该服务有调用权限，或先保存后稍后重试。`,
      )
    }

    return root.toHTML()
  }
}