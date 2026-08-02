// 独立 TMT 验证脚本（不依赖业务代码），用 env 里的 TMT_SECRET_ID / TMT_SECRET_KEY
// 跑法：backend/ 下执行 `npx tsx scripts/test-tmt.ts`
import * as dotenv from 'dotenv'
dotenv.config()
import { createHash, createHmac } from 'node:crypto'

async function main() {
  const sid = process.env.TMT_SECRET_ID
  const skey = process.env.TMT_SECRET_KEY
  console.log('TMT_SECRET_ID =', sid ? `${sid.slice(0, 8)}…(len=${sid.length})` : '<未配置>')
  console.log('TMT_SECRET_KEY =', skey ? `${skey.slice(0, 6)}…(len=${skey.length})` : '<未配置>')
  console.log('TMT_REGION =', process.env.TMT_REGION || 'ap-guangzhou（默认）')

  if (!sid || !skey) {
    console.error('❌ 未配置 TMT 密钥，退出')
    process.exit(1)
  }

  const text = '把每一次出发，先在纸上走一遍。'
  const region = process.env.TMT_REGION || 'ap-guangzhou'
  const Host = 'tmt.tencentcloudapi.com'
  const Version = '2018-03-21'
  const Action = 'TextTranslate'
  const payload = JSON.stringify({
    SourceText: text,
    Source: 'zh',
    Target: 'en',
    ProjectId: 0,
  })

  const now = new Date()
  const timestamp = Math.floor(now.getTime() / 1000)
  const date = now.toISOString().slice(0, 10)
  const service = 'tmt'

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${Host}\nx-tc-action:${Action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const httpRequestMethod = 'POST'
  const canonicalUri = '/'
  const canonicalQueryString = ''
  const hashedRequestPayload = createHash('sha256').update(payload, 'utf8').digest('hex')
  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join('\n')

  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    createHash('sha256').update(canonicalRequest, 'utf8').digest('hex'),
  ].join('\n')

  const secretDate = createHmac('sha256', 'TC3' + skey).update(date).digest()
  const secretService = createHmac('sha256', secretDate).update(service).digest()
  const secretSigning = createHmac('sha256', secretService).update('tc3_request').digest()
  const signature = createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  const authorization =
    `TC3-HMAC-SHA256 Credential=${sid}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  console.log('\n--- 准备发起 TMT 请求 ---')
  console.log('SourceText:', text)
  console.log('Region:', region)

  const res = await fetch(`https://${Host}/`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host,
      'X-TC-Action': Action,
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': Version,
      'X-TC-Region': region,
    },
    body: payload,
    signal: AbortSignal.timeout(15000),
  })

  const data = (await res.json().catch(() => ({}))) as any
  console.log('\nHTTP 状态:', res.status)
  console.log('Response:', JSON.stringify(data, null, 2))

  if (data?.Response?.Error) {
    console.error('\n❌ TMT 返回错误:', data.Response.Error)
    process.exit(1)
  }
  const target = data?.Response?.TargetText
  if (target) {
    console.log('\n✅ 翻译成功:', target)
  } else {
    console.error('\n❌ 响应无 TargetText')
    process.exit(2)
  }
}

main().catch((e) => {
  console.error('脚本异常:', e)
  process.exit(99)
})
