// 微站 HTML 文本片段抽取 + 写回工具
// 职责：从 contentHtml 中抽取可见文本片段（跳过 script/style/noscript/空白）→ reviewer 逐条改 → 写回文本节点
// 安全：写回后的 HTML 仍走后端 sanitizeHtml() 重洗，杜绝注入
// 中文参考：zhParallel() 抽取中文源片段并列显示；因中英标记结构可不同，标注"仅供参考"

export interface HtmlSegment {
  index: number // 在所有可见文本节点中的顺序号（用于写回定位）
  text: string // 当前文本内容
}

// 判断节点是否应跳过（script/style/noscript 内文本、纯空白）
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT'])
function isSkippable(node: Node): boolean {
  const parent = node.parentElement
  if (parent && SKIP_TAGS.has(parent.tagName)) return true
  const text = (node.textContent || '').trim()
  if (!text) return true
  return false
}

/** 从 HTML 中抽取所有可见文本片段，按遍历顺序编号。空字符串返回空数组。 */
export function extractSegments(html: string): HtmlSegment[] {
  if (!html) return []
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const segments: HtmlSegment[] = []
  let index = 0

  // NodeFilter 类型：TS 类型声明中 FILTER_ACCEPT / FILTER_REJECT 是常量，
  // 但某些环境可能未声明；用数值字面量兜底（FILTER_ACCEPT=1, FILTER_REJECT=2）
  const acceptNode = (node: Node): number => (isSkippable(node) ? 2 : 1)

  // 兼容：如果 createTreeWalker 不支持 { acceptNode } 对象参数，回退到完整 NodeFilter 对象
  let walker: TreeWalker
  try {
    walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, { acceptNode })
  } catch {
    walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node: Node) => {
        const parent = node.parentElement
        if (parent && SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT
        if (!(node.textContent || '').trim()) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })
  }

  while (walker.nextNode()) {
    segments.push({ index, text: walker.currentNode.textContent || '' })
    index++
  }

  return segments
}

/** 将修改后的文本片段写回 HTML，输出新的 HTML 字符串。
 *  @param html 原始 HTML
 *  @param updates index → 新文本的 Map
 *  @returns 写回后的 HTML 字符串（body 内） */
export function applySegments(html: string, updates: Map<number, string>): string {
  if (!html || updates.size === 0) return html
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  let index = 0
  let walker: TreeWalker
  try {
    walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node: Node) => (isSkippable(node) ? 2 : 1),
    })
  } catch {
    walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (node: Node) => {
        const parent = node.parentElement
        if (parent && SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT
        if (!(node.textContent || '').trim()) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })
  }

  while (walker.nextNode()) {
    if (updates.has(index)) {
      walker.currentNode.textContent = updates.get(index)!
    }
    index++
  }

  // 序列化 body 内容（排除 DOMParser 自动添加的 <html><head><body> 包装）
  return doc.body.innerHTML
}

/** 抽取中文版微站文本片段作平行参考。若 htmlZh 为空返回 null。
 *  ⚠️ 中文片段与 EN/TH 片段按遍历顺序含义未必一一对应（标记结构可不同），仅作参考提示。 */
export function zhParallel(htmlZh: string): string[] | null {
  if (!htmlZh) return null
  return extractSegments(htmlZh).map((s) => s.text)
}
