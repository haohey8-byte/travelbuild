import { createRequire } from 'node:module'
const require = createRequire('c:/Users/27549/.workbuddy/binaries/node/workspace/anchor.js')
const { chromium } = require('playwright')
const FRONTEND = 'https://travelbuild-d3gvgvtj70ddd0e43-1379227294.tcloudbaseapp.com'

async function main() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  page.on('request', (req) => {
    if (req.url().includes('/api/routes') && req.method() === 'POST') {
      console.log('>> REQ BODY:', req.postData())
    }
  })
  page.on('response', async (res) => {
    if (res.url().includes('/api/routes') && res.request().method() === 'POST') {
      console.log('<< RES STATUS:', res.status())
      try { console.log('<< RES BODY:', await res.text()) } catch {}
    }
  })
  page.on('requestfailed', (req) => {
    if (req.url().includes('/api/routes')) console.log('XX REQ FAILED:', req.failure()?.errorText)
  })

  await page.goto(FRONTEND, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '一手 PandaKing' }).click()
  await page.waitForURL('**/routes/kanban')
  const ts = Date.now()
  await page.getByRole('button', { name: '+ 创建路线' }).click()
  const form = page.locator('form')
  await form.getByPlaceholder('Smith Family').fill('SmithB' + ts)
  await form.getByPlaceholder('成都·九寨').fill('上海·杭州')
  await form.locator('input[type=number]').first().fill('2')
  await form.getByRole('button', { name: '创建' }).click()
  await page.waitForTimeout(3000)
  await browser.close()
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })
