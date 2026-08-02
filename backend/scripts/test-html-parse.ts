import * as HTMLParserNs from 'node-html-parser'
const HTMLParser = (HTMLParserNs as any).default ?? HTMLParserNs
const html = `<section><h1>川西三日，雪山与冰川任驰骋</h1><p>从成都出发，三天串联四姑娘山、毕棚沟与达古冰川——雪峰、红叶、原始森林与低海拔冰川一次收割。</p><span class="hl">WEST SICHUAN · MOUNTAIN LOOP</span></section>`
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
    } else if (tn === ELEMENT_NODE_TYPE) {
      walk(child)
    }
  }
}
walk(root)
console.log('text nodes found:', textQueue.length)
for (const t of textQueue) console.log('-', JSON.stringify(t.original))
