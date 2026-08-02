import { renderCaseOgPage } from '../src/modules/case/case-og-page'

const HTML = `<section class="tour"><h2>Day 1 成都 → 四姑娘山</h2><p>双桥沟游览，宿四姑娘山镇。</p><h2>Day 2 毕棚沟</h2><p>红石滩、雪山温泉。</p><h2>Day 3 达古冰川</h2><p>冰川索道，返程成都。</p></section>`

// 场景1：微站案例（contentHtml 有值，daysContent 空），via=agencyId
const a = renderCaseOgPage(
  {
    id: 'x',
    title: '成都-四姑娘山-毕棚沟-达古冰川',
    destination: '四川',
    days: 3,
    cover: 'https://example.com/cover.jpg',
    descZh: '',
    daysContent: [],
    contentHtml: HTML,
    agency: { name: '成都某境外旅行社', logoUrl: null, contacts: { wechat: 'pk9' } },
  },
  'https://www.pandaking9.cn/share/case/x',
  'https://www.pandaking9.cn',
)

// 场景2：纯 PandaKing9 分享（无 agency）
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
pass = check('微站案例', a, [
  '成都某境外旅行社 · 入境游定制旅行', // 落款=机构名
  'Day 1 成都 → 四姑娘山',            // contentHtml 内联
  '达古冰川',
  'class="microsite"',
], [
  '查看 PandaKing9 更多案例',
  '/#/cases',
]) && pass

pass = check('纯PandaKing9', b, [
  'PandaKing9 · 入境游定制旅行', // 无 agency 回落
  '摘要',
], [
  '查看 PandaKing9 更多案例',
  '成都某境外旅行社',
]) && pass

console.log(pass ? '\nALL PASS' : '\nFAILED')
process.exit(pass ? 0 : 1)
