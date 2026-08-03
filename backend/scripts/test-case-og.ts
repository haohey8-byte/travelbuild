import { renderCaseOgPage } from '../src/modules/case/case-og-page'

const HTML = `<section class="tour"><h2>Day 1 成都 → 四姑娘山</h2><p>双桥沟游览，宿四姑娘山镇。</p><h2>Day 2 毕棚沟</h2><p>红石滩、雪山温泉。</p><h2>Day 3 达古冰川</h2><p>冰川索道，返程成都。</p></section>`

// 场景1：微站案例（contentHtml 有值，daysContent 空），via=agencyId，含 en/th 翻译
const a = renderCaseOgPage(
  {
    id: 'x',
    title: '成都-四姑娘山-毕棚沟-达古冰川',
    titleEn: 'Chengdu - Mt. Siguniang - Bipenggou - Daigu Glacier',
    titleTh: 'เฉิงตู-ซีกุนยาง-บิ๋เปิงโกว-ดารู่แก๊ลเชียร์',
    destination: '四川',
    days: 3,
    cover: 'https://example.com/cover.jpg',
    descZh: '四川经典雪山环线',
    descEn: 'Classic Sichuan snow mountain loop',
    descTh: 'เส้นทางภูเขาหิมะเสฉวน',
    highlights: ['雪山', '冰川'],
    highlightsEn: ['Snow Mountain', 'Glacier'],
    highlightsTh: ['ภูเขาหิมะ', 'ธารน้ำแข็ง'],
    daysContent: [],
    daysContentEn: [],
    daysContentTh: [],
    contentHtml: HTML,
    contentHtmlEn: '',
    contentHtmlTh: '',
    agency: { name: '成都某境外旅行社', logoUrl: null, contacts: { wechat: 'pk9' } },
  },
  'https://www.pandaking9.cn/share/case/x',
  'https://www.pandaking9.cn',
)

// 场景2：纯 PandaKing9 分享（无 agency，无 contentHtml）
const b = renderCaseOgPage(
  {
    id: 'y',
    title: '测试案例',
    destination: '云南',
    days: 5,
    cover: 'https://example.com/c2.jpg',
    descZh: '摘要',
    daysContent: [],
    contentHtml: '',
    agency: null,
  },
  'https://www.pandaking9.cn/share/case/y',
  'https://www.pandaking9.cn',
)

function check(name: string, html: string, must: string[], mustNot: string[]) {
  let ok = true
  for (const m of must) if (!html.includes(m)) { console.log(`  ✗ [${name}] 缺少: ${m}`); ok = false }
  for (const m of mustNot) if (html.includes(m)) { console.log(`  ✗ [${name}] 不该有: ${m}`); ok = false }
  console.log(`  ${ok ? '✓' : '✗'} ${name}`)
  return ok
}

let pass = true

// 场景1 校验：多语言切换条 + 三语言文本块 + iframe 微服务 + REVEAL_FIX/RESIZE_SCRIPT + 落款 + 无"更多案例"
pass = check('微站案例-多语言与iframe', a, [
  '成都某境外旅行社</span>" &amp; <span class="brand9">pandaking9', // 落款=机构名（联合品牌格式）
  'data-lang-btn="zh"', 'data-lang-btn="en"', 'data-lang-btn="th"', // 切换条
  'data-lang="zh"', 'data-lang="en"', 'data-lang="th"', // 三语言文本块
  '成都-四姑娘山-毕棚沟-达古冰川'.slice(0, 6),     // 中文标题
  'Chengdu - Mt. Siguniang', // 英文标题
  'id="microsite"',          // 微站 iframe
  'class="microsite-frame"',
  'sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"',
  'Day 1 成都 → 四姑娘山',   // contentHtml 内联进 iframe srcdoc
  '达古冰川',
  '.reveal,.fade-in',        // REVEAL_FIX 注入
  '__caseHtmlHeight',        // RESIZE_SCRIPT 注入
  'navigator.language',      // 默认语言跟随手机
  'var REVEAL_FIX', 'var RESIZE_SCRIPT',
], [
  '查看 PandaKing9 更多案例',
  '/#/cases',
  'class="microsite"',       // 旧的内联 div.microsite 应消失
]) && pass

// 校验：非 zh 文本块默认隐藏（无 JS / SEO 回落中文）
pass = check('微站案例-非zh默认隐藏', a, [
  'data-lang="en" style="display:none"',
  'data-lang="th" style="display:none"',
], []) && pass

// 场景2 校验：纯 PandaKing9 回落（无 agency = 单品牌，不写"联合定制旅行"）
pass = check('纯PandaKing9', b, [
  '<b>PandaKing9</b> · 定制旅行', // 无 agency 仅显示单品牌（Pandaking9 与运营主体同一身份）
  '摘要',
], [
  '查看 PandaKing9 更多案例',
  '成都某境外旅行社',
  '联合定制旅行',        // 无境外旅行社身份时不应出现"联合定制旅行"
  '随程国际旅行社',      // 不应再把运营主体当联合方列出
  'id="microsite"',     // 无 contentHtml 不应渲染 iframe 元素（CSS 类名常驻，故只校验元素）
]) && pass

console.log(pass ? '\nALL PASS' : '\nFAILED')
process.exit(pass ? 0 : 1)
