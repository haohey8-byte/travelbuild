import { createHash, createHmac } from 'node:crypto'

// 腾讯云机器翻译 TMT（TextTranslate）调用 —— TC3-HMAC-SHA256 签名 v3
// 文档：https://cloud.tencent.com/document/api/551/40566
const TMT_HOST = 'tmt.tencentcloudapi.com'
const TMT_VERSION = '2018-03-21'

export interface TmtConfig {
  secretId: string
  secretKey: string
  region?: string
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}
function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data, 'utf8').digest()
}

export async function tmtTranslate(
  cfg: TmtConfig,
  sourceText: string,
  source: string,
  target: string,
): Promise<string> {
  const text = String(sourceText || '').slice(0, 2000) // TMT 单次限制 2000 字符
  if (!text.trim()) return ''

  const payload = JSON.stringify({
    SourceText: text,
    Source: source,
    Target: target,
    ProjectId: 0,
  })

  const now = new Date()
  const timestamp = Math.floor(now.getTime() / 1000)
  const date = now.toISOString().slice(0, 10) // YYYY-MM-DD（UTC，签名用）
  const service = 'tmt'
  const region = cfg.region || 'ap-guangzhou'
  const action = 'texttranslate'

  // 1. CanonicalRequest
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${TMT_HOST}\nx-tc-action:${action}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256Hex(payload)].join('\n')

  // 2. StringToSign
  const credentialScope = `${date}/${service}/tc3_request`
  const stringToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n')

  // 3. Signature
  const secretDate = hmac('TC3' + cfg.secretKey, date)
  const secretService = hmac(secretDate, service)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = createHmac('sha256', secretSigning).update(stringToSign, 'utf8').digest('hex')

  const authorization =
    `TC3-HMAC-SHA256 Credential=${cfg.secretId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  // 4. 请求
  const res = await fetch(`https://${TMT_HOST}/`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json; charset=utf-8',
      Host: TMT_HOST,
      'X-TC-Action': 'TextTranslate',
      'X-TC-Timestamp': String(timestamp),
      'X-TC-Version': TMT_VERSION,
      'X-TC-Region': region,
    },
    body: payload,
    signal: AbortSignal.timeout(15000),
  })
  const data = (await res.json().catch(() => ({}))) as any
  const err = data?.Response?.Error
  if (!res.ok || err) {
    throw new Error(
      `TMT 翻译失败${err?.Code ? ` (${err.Code})` : ` (HTTP ${res.status})`}: ${err?.Message || ''}`.trim(),
    )
  }
  return data?.Response?.TargetText || ''
}
