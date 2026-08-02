import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import * as HTMLParserNs from 'node-html-parser'
import { tmtTranslate, tmtTranslateBatch } from './tmt.translator'

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

  // ── TMT 全局限速（令牌桶）──────────────────────────────────────────────
  // TMT 官方限制 5 次/秒（RequestLimitExceeded）。所有 TMT HTTP 调用（单条 + 批量）
  // 都经 acquireSlot() 串行化到 ≤4 次/秒，留 1 次余量，避免并行 Promise.all 打爆配额。
  // 用 gate 链式串行化，确保「读取下次允许时间 → sleep → 更新」在并发下也严格有序，
  // 否则多个 await 同时读到同一 bucketNext 会全部一起放行（竞态）。
  private bucketNext = 0
  private readonly bucketInterval = 250 // ms → 4 次/秒
  private gate: Promise<void> = Promise.resolve()

  private acquireSlot(): Promise<void> {
    const run = async () => {
      const now = Date.now()
      const wait = Math.max(0, this.bucketNext - now)
      if (wait > 0) await new Promise((r) => setTimeout(r, wait))
      this.bucketNext = Date.now() + this.bucketInterval
    }
    const result = this.gate.then(() => run())
    // 无论 run 成功失败都让链继续，后续调用挂在这之后
    this.gate = result.then(
      () => {},
      () => {},
    )
    return result
  }

  /** 中文 → 目标语种（en/th），经全局限速闸门 */
  async translateZh(text: string, target: 'en' | 'th'): Promise<string> {
    const sid = process.env.TMT_SECRET_ID
    const skey = process.env.TMT_SECRET_KEY
    if (!sid || !skey) {
      throw new Error('翻译服务未配置：缺少 TMT_SECRET_ID/TMT_SECRET_KEY')
    }
    await this.acquireSlot()
    const out = await tmtTranslate(
      { secretId: sid, secretKey: skey, region: process.env.TMT_REGION || 'ap-guangzhou' },
      text,
      'zh',
      target,
    )
    this.logger.log(`tmt translate zh->${target} (${text.length} chars)`)
    return out
  }

  /** 批量翻译（经全局限速闸门）。空数组直接返回空数组。 */
  private async batchTranslate(texts: string[], target: 'en' | 'th'): Promise<string[]> {
    if (!texts.length) return []
    const sid = process.env.TMT_SECRET_ID
    const skey = process.env.TMT_SECRET_KEY
    if (!sid || !skey) {
      throw new Error('翻译服务未配置：缺少 TMT_SECRET_ID/TMT_SECRET_KEY')
    }
    await this.acquireSlot()
    return tmtTranslateBatch(
      { secretId: sid, secretKey: skey, region: process.env.TMT_REGION || 'ap-guangzhou' },
      texts,
      'zh',
      target,
    )
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

    // 3. 合并所有可翻译字符串，按 ≤5000 字符分块，逐块批量翻译 + 写回。
    //    分块批量大幅减少 TMT 请求数（82 个节点 → 几次请求），配合全局令牌桶彻底远离 5次/秒 限速。
    //    单块失败即 throw，把 TMT 错误原文抛给前端（避免静默半翻译）。已成功写回的块不受影响。
    type Item =
      | { kind: 'text'; node: any; original: string }
      | { kind: 'attr'; el: any; attr: string; original: string }

    const items: Item[] = [
      ...textQueue.map((t) => ({ kind: 'text' as const, node: t.node, original: t.original })),
      ...attrQueue.map((a) => ({ kind: 'attr' as const, el: a.el, attr: a.attr, original: a.original })),
    ]
    if (!items.length) {
      // node-html-parser v9 移除了 toHTML()，正确序列化方法是 toString()
      return root.toString()
    }

    const CHUNK_CHARS = 5000 // 留余量：TMT 批量单次总长度 < 6000
    const CHUNK_ITEMS = 20 // 兜底：单块条数上限，防未知隐藏限制
    const chunks: Item[][] = []
    let cur: Item[] = []
    let sum = 0
    for (const it of items) {
      const len = (it.original || '').length
      if (cur.length && (sum + len > CHUNK_CHARS || cur.length >= CHUNK_ITEMS)) {
        chunks.push(cur)
        cur = []
        sum = 0
      }
      cur.push(it)
      sum += len
    }
    if (cur.length) chunks.push(cur)

    for (const chunk of chunks) {
      const srcs = chunk.map((c) => c.original)
      let outs: string[]
      try {
        outs = await this.batchTranslate(srcs, target)
      } catch (e: any) {
        const msg = e?.message || String(e)
        const sample = srcs[0]?.length > 40 ? srcs[0].slice(0, 40) + '…' : srcs[0] || ''
        this.logger.warn(`batch translate fail: ${msg} | sample=${sample}`)
        throw new BadRequestException(
          `HTML 翻译失败 ${srcs.length} 处（首处样本：${sample}）：${msg}。请检查 TMT 密钥是否对该服务有调用权限，或先保存后稍后重试。`,
        )
      }
      chunk.forEach((it, i) => {
        const translated = outs[i] ?? ''
        if (it.kind === 'text') {
          // node-html-parser v9：TextNode.text 是只读 getter，必须用 rawText 写回并手动转义 & <>
          // （文本节点仅这三个需转义，避开 textContent setter 内部 encode 把非 ASCII 编成 &#xNNNN; 膨胀 HTML）
          it.node.rawText = translated
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
        } else {
          it.el.setAttribute(it.attr, translated)
        }
      })
    }

    // node-html-parser v9 移除了 toHTML()，正确序列化方法是 toString()
    // （HTMLElement.toString 内部 formatNode(tag, attrs, innerHTML)）
    return root.toString()
  }
}