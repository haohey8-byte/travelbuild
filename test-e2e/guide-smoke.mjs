// 操作指引浮层冒烟测试
import { createRequire } from 'module'
const require = createRequire('c:/Users/27549/.workbuddy/binaries/node/workspace/anchor.js')
const { chromium } = require('playwright')

const BASE = 'https://travelbuild-d3gvgvtj70ddd0e43-1379227294.tcloudbaseapp.com'
const results = []
const rec = (name, ok, info) => results.push({ name, status: ok ? 'PASS' : 'FAIL', info })

const browser = await chromium.launch()

// 用全新 context（无 localStorage）模拟首次访问
const ctx = await browser.newContext()
const page = await ctx.newPage()
try {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  // dev-login 选一手
  await page.getByRole('button', { name: '一手 PandaKing' }).click()
  // 首次访问：指引浮层会立刻出现（已在看板内），先等指引文案
  await page.getByText('欢迎使用协作工作台').waitFor({ timeout: 15000 })
  await page.waitForTimeout(500)

  rec('首访弹出指引浮层', await page.getByText('欢迎使用协作工作台').isVisible(), '含欢迎语')
rec('指引含三步文案', (await page.getByText('创建路线').count()) > 0 && (await page.getByText('保存并通知').count()) > 0, '三步均在')
rec('右下角 ? 帮助按钮存在', await page.locator('.help-fab').isVisible(), 'help-fab 可见')

// 关闭
await page.getByRole('button', { name: '开始使用' }).click()
await page.waitForTimeout(400)
rec('点击开始后浮层关闭', !(await page.getByText('欢迎使用协作工作台').isVisible().catch(() => false)), '已关闭')
rec('关闭后写入 localStorage', (await page.evaluate(() => localStorage.getItem('pk_guide_dismissed'))) === '1', 'pk_guide_dismissed=1')

// 重新加载：应记住已读，不再弹
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
rec('刷新后不再自动弹出', !(await page.getByText('欢迎使用协作工作台').isVisible().catch(() => false)), '已记住')

// 点 ? 重开
await page.locator('.help-fab').click()
await page.waitForTimeout(400)
rec('? 按钮可重看指引', await page.getByText('欢迎使用协作工作台').isVisible(), '重开成功')

  await ctx.close()
  await browser.close()
} catch (e) {
  await page.screenshot({ path: 'd:/workbuddy-project/test-e2e/shots/guide-diag.png' }).catch(() => {})
  console.error('冒烟测试异常:', e.message)
  process.exit(2)
}

const pass = results.filter((r) => r.status === 'PASS').length
console.log('\n==== 操作指引浮层冒烟 ====')
for (const r of results) console.log(`${r.status === 'PASS' ? '✅' : '🔴'} [${r.status}] ${r.name} — ${r.info}`)
console.log(`\n合计: ${pass}/${results.length} PASS`)
process.exit(pass === results.length ? 0 : 1)
