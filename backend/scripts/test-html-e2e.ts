// 端到端：node-html-parser 解析 + 真实 TMT 翻译 + 写回；确认 contentHtml 翻译链是否真的能产出英/泰
import * as HTMLParserNs from 'node-html-parser'
import { tmtTranslate } from '../src/modules/translate/tmt.translator'
const HTMLParser = (HTMLParserNs as any).default ?? HTMLParserNs

const HTML = `<section><h1>川西三日，雪山与冰川任驰骋</h1><p>从成都出发，三天串联四姑娘山、毕棚沟与达古冰川——雪峰、红叶、原始森林与低海拔冰川一次收割。</p><span class="hl">WEST SICHUAN · MOUNTAIN LOOP</span><img alt="雪山日落" src="x.jpg"/></section>`

async function translateHtml(html: string, target: 'en' | 'th'): Promise<string> {
  const root = HTMLParser.parse(html)
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
      } else if (tn === ELEMENT_NODE_TYPE) walk(child)
    }
  }
  walk(root)
  const TRANSLATABLE_ATTRS = ['alt', 'title', 'aria-label', 'placeholder']
  const attrQueue: { el: any; attr: string; original: string }[] = []
  for (const el of root.querySelectorAll('*')) {
    for (const a of TRANSLATABLE_ATTRS) {
      const v = el.getAttribute(a)
      if (v && v.trim()) attrQueue.push({ el, attr: a, original: v })
    }
  }
  const sid = process.env.TMT_SECRET_ID!
  const skey = process.env.TMT_SECRET_KEY!
  const cred = { secretId: sid, secretKey: skey, region: process.env.TMT_REGION || 'ap-guangzhou' }
  for (const t of textQueue) {
    t.node.text = await tmtTranslate(cred, t.original, 'zh', target)
  }
  for (const a of attrQueue) {
    a.el.setAttribute(a.attr, await tmtTranslate(cred, a.original, 'zh', target))
  }
  return root.toHTML()
}

async function main() {
  console.log('--- translating HTML to EN ---')
  const en = await translateHtml(HTML, 'en')
  console.log(en)
  console.log('\n--- translating HTML to TH ---')
  const th = await translateHtml(HTML, 'th')
  console.log(th)
}
main().catch((e) => {
  console.error('ERR:', e?.response?.data || e)
  process.exit(1)
})
