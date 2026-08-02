// 验证 translateHtmlContent 的「批量分块 + 写回」逻辑（无需真实 TMT 密钥）
// 通过把 TranslateService.batchTranslate 替换成 fake，覆盖：多文本节点、属性翻译、
// 跳过 <script>、HTML 实体保留、UTF-8 中文不被编码成 &#xNNNN;、分块边界顺序正确。
import { TranslateService } from '../src/modules/translate/translate.service'

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('❌ FAIL:', msg)
    process.exit(1)
  }
  console.log('✅', msg)
}

async function main() {
  const svc = new TranslateService()
  // 注入 fake 批量翻译：给每段加前缀，便于断言顺序/内容
  ;(svc as any).batchTranslate = async (texts: string[], target: string) => {
    return texts.map((t) => `[${target}]${t}`)
  }

  const html = `<!DOCTYPE html><html><head><title>川西线路</title>
<script>const x = "雪山环线"; // 不应被翻译</script>
</head><body>
<h1>川西三日</h1>
<p class="lead">AT&amp;T 大本营，海拔 4000m。</p>
<img src="a.jpg" alt="四姑娘山雪景" title="四姑娘山">
<ul><li>第一天：成都</li><li>第二天：四姑娘山</li></ul>
</body></html>`

  const out = await svc.translateHtmlContent(html, 'en')

  // 文本节点应被批量翻译（加 [en] 前缀）
  assert(out.includes('[en]川西三日'), 'h1 文本节点被批量翻译')
  assert(out.includes('[en]AT&amp;T 大本营，海拔 4000m。'), '含 HTML 实体(&amp;)的文本正确保留实体并翻译')
  assert(out.includes('[en]第一天：成都') && out.includes('[en]第二天：四姑娘山'), '列表项文本节点翻译且顺序正确')
  assert(out.includes('[en]川西线路'), 'title 文本节点翻译')

  // 属性应被翻译
  assert(out.includes('alt="[en]四姑娘山雪景"'), 'img alt 属性被批量翻译')
  assert(out.includes('title="[en]四姑娘山"'), 'img title 属性被批量翻译')

  // script 内部文本不可翻译
  assert(!out.includes('[en]雪山环线'), 'script 内部文本未被翻译')
  assert(out.includes('const x = "雪山环线"'), 'script 原始内容保留')

  // UTF-8 中文不应被编码成数值引用
  assert(!out.includes('&#x5ddd;'), '中文 UTF-8 未被 encode 成 &#xNNNN;（体积未膨胀）')

  // 非 ASCII 仍正常保留（翻译后可能含中文备注）
  assert(out.includes('雪山环线'), 'script 内中文原文保留')

  // 真实批量冒烟（仅当环境配置了 TMT 密钥时）
  if (process.env.TMT_SECRET_ID && process.env.TMT_SECRET_KEY) {
    const real = new TranslateService()
    const r = await real.translateHtmlContent('<p>你好世界</p><div>第二次翻译</div>', 'en')
    console.log('🌐 真实 TMT 批量结果:', r)
    assert(r.includes('<p>') && r.includes('</p>'), '真实批量调用返回结构完整')
  } else {
    console.log('⏭️  未配置 TMT_SECRET_ID/KEY，跳过真实批量冒烟（逻辑已用 fake 验证）')
  }

  console.log('\n🎉 全部通过：批量分块 + 写回 逻辑正确')
}

main().catch((e) => {
  console.error('💥 测试异常:', e)
  process.exit(1)
})
