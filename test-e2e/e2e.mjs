// 全面 E2E 测试 —— 入境游定制协作工作台（部署版）
// 覆盖：登录 / 创建路线 / 生成协作 H5 链接 / H5 页面标题·标签·OG元信息 / 负向兜底 / 知识库 / 案例 / A11y
import { createRequire } from 'node:module'
import fs from 'node:fs'
const require = createRequire('c:/Users/27549/.workbuddy/binaries/node/workspace/anchor.js')
const { chromium } = require('playwright')

const FRONTEND = 'https://travelbuild-d3gvgvtj70ddd0e43-1379227294.tcloudbaseapp.com'
const API = 'https://travelbuild-281496-9-1379227294.sh.run.tcloudbase.com/api'

const STATUS_LABEL = {
  consulting: '咨询中', awaiting_pk_confirm: '待一手确认', awaiting_agency_revision: '待旅行社修订',
  awaiting_quote: '待报价', awaiting_feedback: '待反馈', awaiting_confirm: '待确认',
  confirmed: '已确认', lost: '已流失',
}
const RAW_KEYS = Object.keys(STATUS_LABEL)

const SHOT_DIR = 'D:/workbuddy-project/test-e2e/shots'
fs.mkdirSync(SHOT_DIR, { recursive: true })
const results = []
const consoleErrors = []
const pageErrors = []
const rec = (name, status, detail, evidence) => {
  results.push({ name, status, detail, evidence: evidence ?? null })
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
  console.log(`${icon} [${status}] ${name} — ${detail}`)
}

// 用后端 API 生成一个真正有效的 H5 链接（绕过 Bug B 的 UI 链接）
async function genValidH5(routeId) {
  const login = await fetch(`${API}/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'pandaking' }),
  }).then((r) => r.json())
  const tok = login.token
  const h = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` }
  const sv = await fetch(`${API}/routes/${routeId}/versions`, {
    method: 'POST', headers: h,
    body: JSON.stringify({
      itinerary: { days: [{ day: 1, city: '上海', spots: ['外滩'], hotel: '和平饭店', meals: ['本帮菜'] }] },
      quote: { items: [{ type: 'hotel', cost1: 3000, cost2: 1000, markup: 1700 }], totals: { cost1: 3000, cost2: 1000, markup: 1700, guestPrice: 5700 } },
      draft: false, notify: true,
    }),
  }).then((r) => r.json())
  return { link: FRONTEND + '/#' + sv.shareLink, shareLink: sv.shareLink }
}

async function main() {
  const browser = await chromium.launch()

  // ===== 1. 登录 =====
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  const ts = Date.now()
  const dest = '上海·杭州'
  const route = {
    customerName: `SmithQA${ts}`, customerNameCn: `史密斯质量${ts}`,
    destination: dest, agency: 'QA Travel', groupSize: 2, travelDate: '2026-08-01',
  }

  try {
    await page.goto(FRONTEND, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '一手 PandaKing' }).click()
    await page.waitForURL('**/routes/kanban')
    rec('登录(dev-login 角色选择)', 'PASS', '成功进入路线看板')
  } catch (e) { rec('登录(dev-login 角色选择)', 'FAIL', e.message) }

  // ===== 2. 创建路线（UI，填旅行社走通正常路径） =====
  let routeId = null
  try {
    await page.getByRole('button', { name: '+ 创建路线' }).click()
    const form = page.locator('form')
    await form.getByPlaceholder('Smith Family').fill(route.customerName)
    await form.getByPlaceholder('史密斯一家').fill(route.customerNameCn)
    await form.getByPlaceholder('成都·九寨').fill(route.destination)
    await form.getByPlaceholder('境外旅行社名称').fill(route.agency)
    await form.locator('input[type=number]').first().fill(String(route.groupSize))
    await form.locator('input[type=date]').fill(route.travelDate)
    await form.getByRole('button', { name: '创建' }).click()
    await page.waitForTimeout(1500)
    const stillOpen = await page.locator('form').count()
    if (stillOpen > 0) throw new Error('弹窗未关闭（创建失败，可能 500）')
    const card = page.locator('.card', { hasText: route.customerNameCn }).first()
    await card.click()
    await page.getByRole('button', { name: /保存并通知/ }).waitFor({ timeout: 15000 })
    routeId = page.url().split('/routes/')[1]
    rec('创建路线(UI, 填旅行社)', 'PASS', `已创建并进入详情页 id=${routeId}`)
  } catch (e) { rec('创建路线(UI, 填旅行社)', 'FAIL', e.message) }

  // ===== 3. 生成协作 H5 链接（UI） —— 验证 Bug B：链接 token 是否 undefined =====
  try {
    await page.getByRole('button', { name: /保存并通知/ }).click()
    const link = page.getByText('打开协作 H5').first()
    await link.waitFor({ timeout: 10000 })
    const href = await link.getAttribute('href')
    const broken = !href || href.includes('/undefined') || /\/h5\/route\/(undefined|$)/.test(href)
    rec('生成协作 H5 链接(UI)', broken ? 'FAIL' : 'PASS',
      broken ? `生成的链接 token 为 undefined，无法打开: ${href}` : `链接: ${href}`,
      { href })
    await page.screenshot({ path: `${SHOT_DIR}/04-h5-link-ui.png` })
  } catch (e) { rec('生成协作 H5 链接(UI)', 'FAIL', e.message) }

  // ===== 4. 用有效链接打开 H5，验证页面标题/标签/OG（Bug C） =====
  if (routeId) {
    try {
      const { link } = await genValidH5(routeId)
      const hctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const hpage = await hctx.newPage()
      hpage.on('pageerror', (e) => pageErrors.push('[H5] ' + String(e)))
      await hpage.goto(link, { waitUntil: 'networkidle' })
      await hpage.waitForSelector('.h5-title', { timeout: 10000 })
      await hpage.screenshot({ path: `${SHOT_DIR}/05-h5-page.png`, fullPage: true })

      const h5Title = (await hpage.locator('.h5-title').textContent()).trim()
      const docTitle = await hpage.title()
      const statusText = (await hpage.locator('.h5-meta span', { hasText: '状态' }).textContent()).trim()
      const priceText = (await hpage.locator('.h5-price').textContent().catch(() => '')) || ''
      const ogTitle = await hpage.locator('meta[property="og:title"]').count()
      const ogDesc = await hpage.locator('meta[property="og:description"]').count()
      const ogImage = await hpage.locator('meta[property="og:image"]').count()
      const headHtml = await hpage.evaluate(() => document.head.innerHTML)

      rec('H5-页面内大标题(目的地)', h5Title.includes(dest) ? 'PASS' : 'FAIL',
        `页面大标题 = 「${h5Title}」`)

      const docTitleOk = docTitle.includes(dest)
      rec('H5-浏览器标签/分享卡片标题(document.title)', docTitleOk ? 'PASS' : 'FAIL',
        `document.title = 「${docTitle}」${docTitleOk ? '' : '（写死通用标题 → 分享出去没有对客标题）'}`)

      const statusVal = statusText.replace('状态:', '').trim()
      const showsRaw = RAW_KEYS.includes(statusVal)
      rec('H5-状态标签(应为中文)', showsRaw ? 'FAIL' : 'PASS',
        `状态显示 = 「${statusVal}」${showsRaw ? `（暴露原始机器键，应为「${STATUS_LABEL[statusVal]}」）` : '（正确）'}`)

      const priceNorm = priceText.replace(/[,，\s]/g, '')
      rec('H5-对客总价', /5700/.test(priceNorm) ? 'PASS' : 'FAIL', `价格区 = 「${priceText.trim()}」`)

      rec('H5-分享预览 OG 元信息', (ogTitle && ogDesc && ogImage) ? 'PASS' : 'FAIL',
        `og:title=${ogTitle} og:description=${ogDesc} og:image=${ogImage}（均为 0 → 微信/其他平台无正常预览卡片）`)

      rec('H5-静态 <head> 元信息', /og:title/.test(headHtml) ? 'PASS' : 'FAIL',
        /og:title/.test(headHtml) ? 'head 含 og:title' : 'index.html 仅写死 <title>，无 og:*（hash SPA 服务端无法按路由注入）')

      await hctx.close()
    } catch (e) { rec('H5-打开并校验(有效链接)', 'FAIL', e.message) }
  }

  // ===== 5. 负向：伪造 token =====
  try {
    const nctx = await browser.newContext()
    const npage = await nctx.newPage()
    await npage.goto(`${FRONTEND}/#/h5/route/__not_a_real_token__`, { waitUntil: 'networkidle' })
    const txt = await npage.getByText('协作链接无效或已过期').innerText().catch(() => '')
    rec('H5-无效 token 兜底', txt ? 'PASS' : 'FAIL', txt ? '显示无效提示' : '未显示兜底文案')
    await npage.screenshot({ path: `${SHOT_DIR}/06-h5-invalid.png` })
    await nctx.close()
  } catch (e) { rec('H5-无效 token 兜底', 'FAIL', e.message) }

  // ===== 6. 知识库冒烟 =====
  try {
    await page.goto(`${FRONTEND}/#/kb`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '+ 新增' }).click()
    await page.getByPlaceholder('标题', { exact: true }).waitFor({ timeout: 5000 })
    await page.getByPlaceholder('标题', { exact: true }).fill(`QA知识点${ts}`)
    await page.getByPlaceholder('正文', { exact: true }).fill('E2E 自动创建，稍后清理。')
    await page.getByRole('button', { name: '保存' }).click()
    await page.waitForTimeout(1000)
    const seen = await page.getByText(`QA知识点${ts}`).count()
    rec('知识库-创建并出现', seen > 0 ? 'PASS' : 'FAIL', seen > 0 ? '新建条目已出现' : '未出现')
    if (seen > 0) {
      page.on('dialog', (d) => d.accept())
      await page.locator('button.danger', { hasText: '删除' }).first().click().catch(() => {})
      await page.waitForTimeout(600)
    }
  } catch (e) { rec('知识库-创建并出现', 'FAIL', e.message) }

  // ===== 7. 案例冒烟 =====
  try {
    await page.goto(`${FRONTEND}/#/cases`, { waitUntil: 'networkidle' })
    const sel = page.locator('select.field').first()
    if (await sel.locator('option').count() > 1) {
      await sel.selectOption({ index: 1 })
      await page.getByRole('button', { name: '派生案例' }).click()
      await page.waitForTimeout(1000)
      const cards = await page.locator('.card').count()
      rec('案例-从路线派生', cards > 0 ? 'PASS' : 'FAIL', `案例卡片数 = ${cards}`)
      page.on('dialog', (d) => d.accept())
      await page.locator('button', { hasText: '删除' }).first().click().catch(() => {})
    } else rec('案例-从路线派生', 'WARN', '无可选路线')
  } catch (e) { rec('案例-从路线派生', 'FAIL', e.message) }

  // ===== 8. A11y 基础 =====
  try {
    await page.goto(`${FRONTEND}/#/routes/kanban`, { waitUntil: 'networkidle' })
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('button')].filter((b) => !(b.innerText || '').trim() && !b.getAttribute('aria-label')).length)
    rec('A11y-按钮可访问名称', bad === 0 ? 'PASS' : 'WARN', bad === 0 ? '所有按钮均有可访问名称' : `${bad} 个按钮缺少可访问名称`)
  } catch (e) { rec('A11y-按钮可访问名称', 'WARN', e.message) }

  await ctx.close()
  await browser.close()

  const summary = {
    total: results.length,
    pass: results.filter((r) => r.status === 'PASS').length,
    fail: results.filter((r) => r.status === 'FAIL').length,
    warn: results.filter((r) => r.status === 'WARN').length,
    consoleErrors: consoleErrors.slice(0, 20),
    pageErrors: pageErrors.slice(0, 20),
  }
  fs.writeFileSync('D:/workbuddy-project/test-e2e/result.json', JSON.stringify({ summary, results }, null, 2))
  console.log('\n==== 汇总 ====')
  console.log(JSON.stringify(summary, null, 2))
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })
