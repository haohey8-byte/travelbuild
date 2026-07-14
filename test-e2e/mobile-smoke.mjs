import { createRequire } from 'module'
const require = createRequire('c:/Users/27549/.workbuddy/binaries/node/workspace/anchor.js')
const { chromium } = require('playwright')
const fs = require('fs')

const BASE = 'https://travelbuild-d3gvgvtj70ddd0e43-1379227294.tcloudbaseapp.com'
const SHOT = 'd:/workbuddy-project/test-e2e/shots/mobile'
fs.mkdirSync(SHOT, { recursive: true })

const results = []
const rec = (name, pass, info = '') => { results.push({ name, pass, info }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${info}`) }

const browser = await chromium.launch()

// ---------- 移动端 375px ----------
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true })
const page = await ctx.newPage()
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: '一手 PandaKing' }).click()
await page.getByText('欢迎使用协作工作台').waitFor({ timeout: 15000 }).catch(() => {})
// 关掉指引浮层（如有）
const startBtn = page.getByRole('button', { name: '开始使用' })
if (await startBtn.isVisible().catch(() => false)) await startBtn.click()
await page.waitForTimeout(500)

// 1) 汉堡按钮可见
const hamburgerVisible = await page.locator('.hamburger').isVisible()
rec('移动端汉堡按钮可见', hamburgerVisible)

// 2) 看板渲染且无乱码（tofu/替换字符）
const cards = page.locator('.kanban-grid .card')
const cardCount = await cards.count()
rec('看板卡片渲染', cardCount > 0, `卡片数=${cardCount}`)
const texts = await cards.evaluateAll((els) => els.map((e) => e.innerText))
const garbled = texts.filter((t) => /[�\uFFFD\u0400-\u04FF\u0250-\u02FF]/.test(t))
rec('看板无乱码(tofu/西里尔)', garbled.length === 0, garbled.length ? `仍有乱码: ${garbled.slice(0,3).join(' | ')}` : '全部正常')

await page.screenshot({ path: `${SHOT}/01-mobile-kanban.png`, fullPage: false })

// 3) 打开抽屉导航
await page.locator('.hamburger').click()
await page.waitForTimeout(350)
const drawerVisible = await page.locator('.drawer.open').isVisible().catch(() => false)
rec('抽屉导航可展开', drawerVisible)
await page.screenshot({ path: `${SHOT}/02-mobile-drawer.png` })
// 通过抽屉进入知识库
await page.locator('.drawer-nav a', { hasText: '知识库' }).click()
await page.waitForTimeout(600)
rec('抽屉导航跳转知识库', page.url().includes('/kb'), page.url())
await page.screenshot({ path: `${SHOT}/03-mobile-kb.png` })

// 回看板并打开一条路线详情
await page.locator('.hamburger').click().catch(() => {})
await page.waitForTimeout(300)
await page.locator('.drawer-nav a', { hasText: '路线管理' }).click()
await page.waitForTimeout(600)
await cards.first().click()
await page.waitForSelector('.grid-2', { timeout: 10000 })
await page.waitForTimeout(500)
// 4) 编辑页两列 → 单列（移动端）
const cols = await page.locator('.grid-2').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
rec('详情页移动端单列布局', cols === 1, `grid 列数=${cols}`)
// 5) 报价表被滚动容器包裹
const hasWrap = await page.locator('.grid-2 .tbl-wrap').count()
rec('报价表横向滚动容器', hasWrap > 0, `tbl-wrap 数=${hasWrap}`)
await page.screenshot({ path: `${SHOT}/04-mobile-detail.png`, fullPage: false })

await ctx.close()

// ---------- 桌面端 1280px（验证内联导航） ----------
const ctxD = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const pD = await ctxD.newPage()
await pD.goto(BASE, { waitUntil: 'networkidle' })
await pD.getByRole('button', { name: '一手 PandaKing' }).click()
await pD.getByText('欢迎使用协作工作台').waitFor({ timeout: 15000 }).catch(() => {})
const sb = pD.getByRole('button', { name: '开始使用' })
if (await sb.isVisible().catch(() => false)) await sb.click()
await pD.waitForTimeout(400)
const navInline = await pD.locator('.app-nav').isVisible()
const hamHidden = !(await pD.locator('.hamburger').isVisible())
rec('桌面端内联导航可见+汉堡隐藏', navInline && hamHidden)
await pD.screenshot({ path: `${SHOT}/05-desktop-header.png` })
await ctxD.close()

await browser.close()

const pass = results.filter((r) => r.pass).length
console.log(`\n=== 移动端/桌面端响应式实测：${pass}/${results.length} 通过 ===`)
fs.writeFileSync('d:/workbuddy-project/test-e2e/mobile-result.json', JSON.stringify(results, null, 2))
