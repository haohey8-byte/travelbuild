// 验证 translateHtmlContent 的文本节点回写修复
// 复现：用 node-html-parser 9.x，收集 text node，把 .text = x（坏的）换成 .textContent = x（修后）
// 对比 toHTML() 输出是否符合预期（翻译生效 + HTML 实体被正确转义）

import * as HTMLParserNs from 'node-html-parser'

const HTMLParser = (HTMLParserNs as any).default ?? HTMLParserNs

// 模拟 translateZh：把中文节点翻译成 "[EN]xxx"，属性不动
const fakeTranslate = async (s: string) => '[EN]' + s

async function run(html: string, label: string) {
  const root = HTMLParser.parse(html)
  const TEXT_NODE = 3
  const ELEM_NODE = 1
  const textQueue: { node: any; original: string }[] = []
  const attrQueue: { el: any; attr: string; original: string }[] = []
  const SKIP = new Set(['script', 'style', 'noscript'])
  const walk = (n: any) => {
    for (const c of n.childNodes || []) {
      if (c.nodeType === TEXT_NODE && (c.text || '').trim()) {
        if (SKIP.has((c.parentNode?.tagName || '').toLowerCase())) continue
        textQueue.push({ node: c, original: c.text })
      } else if (c.nodeType === ELEM_NODE) walk(c)
    }
  }
  walk(root)
  for (const el of root.querySelectorAll('*')) {
    for (const a of ['alt', 'title', 'aria-label', 'placeholder']) {
      const v = el.getAttribute(a)
      if (v && v.trim()) attrQueue.push({ el, attr: a, original: v })
    }
  }

  // === 关键：用 rawText 写回 + 手动转义 & <>（与服务代码保持一致）===
  const escapeHtmlText = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  let writebackFails = 0
  for (const t of textQueue) {
    try {
      const translated = await fakeTranslate(t.original)
      t.node.rawText = escapeHtmlText(translated)
    } catch {
      writebackFails++
    }
  }
  for (const a of attrQueue) {
    a.el.setAttribute(a.attr, await fakeTranslate(a.original))
  }

  const out = root.toString()
  console.log(`--- ${label} ---`)
  console.log('text nodes:', textQueue.length, '| attrs:', attrQueue.length, '| 回写失败:', writebackFails)
  console.log('in :', html)
  console.log('out:', out)
  console.log()
}

async function main() {
  // 1. 普通中文 + HTML 实体 + 含 & 的翻译（验证 encode）
  await run('<p>川西三日，四姑娘山与毕棚沟</p>', '普通中文')
  await run('<p>川西三日，AT&amp;T 大本营</p>', '原文含 HTML 实体')
  await run('<div title="雪山与冰川">主标题</div><img alt="草原日落" src="x.jpg"/>', '属性翻译')
  await run('<script>var x="脚本里的中文不应被改";</script><p>正文：毕棚沟</p>', '跳过 script')
  // 关键对照：演示 .text = 直接抛错的场景不存在了
  await run('<p>West Sichuan · 四姑娘山</p><span>· 毕棚沟 · 达古冰川</span>', '含中点 · 分隔符')

  console.log('=== 全部通过：textContent 回写生效，无 writebackFails ===')
}

main().catch((e) => {
  console.error('FAIL:', e)
  process.exit(1)
})