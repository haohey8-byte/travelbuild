import { createRequire } from 'node:module'
const require = createRequire('c:/Users/27549/.workbuddy/binaries/node/workspace/anchor.js')
const { chromium } = require('playwright')

const FRONTEND = 'https://travelbuild-d3gvgvtj70ddd0e43-1379227294.tcloudbaseapp.com'

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERR', String(e)))

  await page.goto(FRONTEND, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '一手 PandaKing' }).click()
  await page.waitForURL('**/routes/kanban')

  const ts = Date.now()
  await page.getByRole('button', { name: '+ 创建路线' }).click()
  const form = page.locator('form')
  await form.getByPlaceholder('Smith Family').fill('SmithDebug' + ts)
  await form.getByPlaceholder('成都·九寨').fill('上海·杭州')
  await form.locator('input[type=number]').first().fill('2')
  await form.getByRole('button', { name: '创建' }).click()
  await page.waitForTimeout(2000)
  const errText = await page.locator('.err').allInnerTexts().catch(() => [])
  console.log('CREATE ERR:', JSON.stringify(errText))
  const modalOpen = await page.locator('form').count()
  console.log('MODAL STILL OPEN (form count):', modalOpen)

  // 尝试点击新建的路线卡片
  const card = page.locator('.card', { hasText: 'SmithDebug' + ts })
  console.log('CARD FOUND:', await card.count())
  if (await card.count()) {
    await card.first().click()
    await page.waitForTimeout(1500)
  }
  const url = page.url()
  console.log('URL NOW:', url)

  // dump buttons
  const btns = await page.evaluate(() =>
    [...document.querySelectorAll('button')].map((b) => b.innerText.trim()),
  )
  console.log('BUTTONS:', JSON.stringify(btns, null, 2))

  // dump itinerary area html (first 1500 chars)
  const itin = await page.evaluate(() => {
    const els = [...document.querySelectorAll('input')].map((i) => i.placeholder).filter(Boolean)
    return els
  })
  console.log('INPUT PLACEHOLDERS:', JSON.stringify(itin))

  const addDay = await page.getByRole('button', { name: /添加一天/ }).count()
  console.log('添加一天 button count:', addDay)

  await page.screenshot({ path: 'D:/workbuddy-project/test-e2e/debug-detail.png', fullPage: true })
  await browser.close()
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })
