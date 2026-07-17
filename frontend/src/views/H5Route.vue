<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchH5Route, submitH5Feedback, fetchH5Feedback } from '@/api/h5'
import { safeText, safeName } from '@/utils/name'
import { shareH5Url, shareH5Caption, collabNotifyText, copyText } from '@/utils/share'
import type { H5Route, RouteFeedbackItem } from '@/types'
import { buildPdfModel, type PdfModel } from '@/utils/pdf-model'
import { generatePdf } from '@/utils/pdf-export'
import { PDF_LANG_OPTIONS, type PdfLang } from '@/utils/pdf-i18n'
import RoutePdf from '@/components/RoutePdf.vue'

const route = useRoute()
const router = useRouter()
const token = route.params.token as string

const data = ref<H5Route | null>(null)
const notFound = ref(false)
const loading = ref(true)
const feedback = ref('')
const authorName = ref('')
const submitting = ref(false)
const thanks = ref(false)
const sendErr = ref('')
const feedbackList = ref<RouteFeedbackItem[]>([])
// 提交反馈后自动生成的通知文案（带主题+建议+H5链接），便于粘贴到微信同步对端
const notifyText = ref('')
const notifyTip = ref('')
// 查看方随时把协作方案链接转发到微信群（复制「说明 + 链接」）
const shareTip = ref('')

// —— 导出游客版 PDF（PRD 5.8：旅行社在 H5 内导出游客版）——
const pdfPanelOpen = ref(false)
const pdfLang = ref<PdfLang>('zh')
const pdfBusy = ref(false)
const pdfErr = ref('')
const pdfModel = ref<PdfModel | null>(null)
const pdfWrap = ref<HTMLElement | null>(null)

async function onExportTouristPdf() {
  if (!data.value) return
  pdfBusy.value = true
  pdfErr.value = ''
  try {
    const d = data.value
    const it = (d.itinerary as { days?: any[] }) ?? {}
    const model = await buildPdfModel({
      route: {
        customerName: d.customerName ?? '',
        customerNameCn: d.customerNameCn ?? '',
        destination: d.destination ?? '',
        groupSize: d.groupSize,
        travelDate: d.travelDate,
        statusKey: d.statusKey,
        version: d.version,
      },
      itinerary: { days: it.days ?? [] },
      quote: {
        items: (d.quote?.items ?? []).map((q) => ({
          name: q.name,
          type: q.type,
          guestPrice: q.guestPrice ?? 0,
        })) as any,
        totals: { guestPrice: d.quote?.totals?.guestPrice ?? d.guestPrice ?? 0 },
      },
      version: 'tourist',
      lang: pdfLang.value,
      statusLabel: statusLabel(d.statusKey),
      versionLabel: d.version,
    })
    pdfModel.value = model
    await nextTick()
    const safe = (d.customerNameCn || d.customerName || 'route').replace(/[\\/:*?"<>|]/g, '_')
    const filename = `${safe}_${model.title}_${model.langName}.pdf`
    if (pdfWrap.value) await generatePdf(pdfWrap.value, filename)
    pdfPanelOpen.value = false
  } catch (e: any) {
    pdfErr.value = e?.message || '导出失败'
  } finally {
    pdfBusy.value = false
  }
}
async function copyShareLink() {
  if (!data.value) return
  const caption = shareH5Caption(data.value)
  const ok = await copyText(`${caption}\n${shareH5Url(token)}`)
  shareTip.value = ok ? '协作链接已复制，去微信粘贴到群里即可 ✅' : '复制失败，请长按上方链接手动复制'
}
async function copyAgain() {
  if (!notifyText.value) return
  const ok = await copyText(notifyText.value)
  notifyTip.value = ok ? '已再次复制，去微信粘贴发给对方 ✅' : '复制失败，请长按上方文字手动复制'
}
async function loadFeedback() {
  try {
    feedbackList.value = await fetchH5Feedback(token)
  } catch {
    feedbackList.value = []
  }
}
function fmtTime(s?: string): string {
  if (!s) return ''
  try {
    return new Date(s).toLocaleString()
  } catch {
    return s
  }
}

const days = computed(() => {
  const it = data.value?.itinerary as { days?: any[] } | null
  return it?.days ?? []
})

// 状态中文标签（避免 H5 暴露原始机器键）
const STATUS_LABEL: Record<string, string> = {
  consulting: '咨询中',
  awaiting_pk_confirm: '待一手确认',
  awaiting_agency_revision: '待旅行社修订',
  awaiting_quote: '待报价',
  awaiting_feedback: '待反馈',
  awaiting_confirm: '待确认',
  confirmed: '已确认',
  lost: '已流失',
}
function statusLabel(k: string): string {
  return STATUS_LABEL[k] ?? k
}

// 客户端兜底：覆盖 index.html 中的通用 OG 标签（对支持 JS 的分享场景）
function updateOgMeta(key: string, content: string) {
  const sel = `meta[property="${key}"], meta[name="${key}"]`
  let el = document.head.querySelector(sel) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    if (key.startsWith('og:')) el.setAttribute('property', key)
    else el.setAttribute('name', key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

onMounted(async () => {
  try {
    data.value = await fetchH5Route(token)
    // 设置浏览器标签标题，打开分享链接时显示对客标题
    const title = `${safeText(data.value.destination) || '定制行程'} · 定制行程方案`
    document.title = title
    updateOgMeta('og:title', title)
      updateOgMeta(
      'og:description',
      `PandaKing9 为您定制的${safeText(data.value.destination) || '行程'}方案${data.value.guestPrice != null ? `，对客总价 ¥${data.value.guestPrice.toLocaleString()}` : ''}`,
      )
      await loadFeedback()
  } catch {
    notFound.value = true
    document.title = '协作链接无效 · PandaKing9'
  } finally {
    loading.value = false
  }
})

async function onSend() {
  const content = feedback.value.trim()
  if (!content) {
    sendErr.value = '请填写反馈内容'
    return
  }
  submitting.value = true
  sendErr.value = ''
  try {
    await submitH5Feedback(token, content, authorName.value.trim() || undefined)
    thanks.value = true
    // 生成「主题+反馈建议+H5链接」通知文案并复制，提示去微信粘贴同步对端
    if (data.value) {
      const text = collabNotifyText({
        kind: 'feedback',
        eventLabel: '提交了修改意见',
        subject: safeName(data.value.customerNameCn, data.value.customerName),
        destination: data.value.destination,
        authorName: authorName.value.trim() || undefined,
        detail: content,
        url: shareH5Url(token),
      })
      notifyText.value = text
      const ok = await copyText(text)
      notifyTip.value = ok
        ? '通知文案已复制，去微信粘贴发给对方即可同步 ✅'
        : '通知文案已生成，请长按上方文字手动复制后发到微信'
    }
    feedback.value = ''
    if (data.value) await loadFeedback()
  } catch (e: any) {
    sendErr.value = e?.response?.data?.message || '提交失败'
  } finally {
    submitting.value = false
  }
}
function goHome() {
  router.push('/routes/kanban')
}
</script>

<template>
  <div class="h5">
    <div v-if="loading" class="center">加载中…</div>

    <div v-else-if="notFound" class="center">
      <p>协作链接无效或已过期</p>
      <button class="btn btn-primary" @click="goHome">返回工作台</button>
    </div>

    <div v-else-if="data" class="h5-card">
      <h1 class="h5-title">{{ safeText(data.destination) || '定制行程' }}</h1>
      <div class="h5-meta">
        <span>版本: {{ data.version }}</span>
        <span>状态: {{ statusLabel(data.statusKey) }}</span>
        <span>人数: {{ data.groupSize }}</span>
      </div>
      <div v-if="data.guestPrice != null" class="h5-price">
        对客总价: <b>¥{{ data.guestPrice.toLocaleString() }}</b>
      </div>

      <button class="btn ghost share-btn" @click="copyShareLink">📋 复制协作链接发到微信群</button>
      <p v-if="shareTip" class="share-tip">{{ shareTip }}</p>

      <button class="btn ghost share-btn" @click="pdfPanelOpen = !pdfPanelOpen">📄 导出游客版PDF</button>
      <div v-if="pdfPanelOpen" class="pdf-tourist-panel">
        <span class="pdf-panel-label">语言</span>
        <label v-for="o in PDF_LANG_OPTIONS" :key="o.value" class="pdf-opt">
          <input type="radio" :value="o.value" v-model="pdfLang" /> {{ o.label }}
        </label>
        <button class="btn btn-primary" :disabled="pdfBusy" @click="onExportTouristPdf">
          {{ pdfBusy ? '生成中…' : '生成并下载' }}
        </button>
        <button class="btn ghost" @click="pdfPanelOpen = false">取消</button>
        <p v-if="pdfErr" class="err">{{ pdfErr }}</p>
      </div>

      <h3>行程安排</h3>
      <div v-if="days.length">
        <div v-for="(d, i) in days" :key="i" class="day">
          <b>第 {{ d.day ?? i + 1 }} 天 · {{ d.city }}</b>
          <div v-if="d.spots?.length" class="line">景点：{{ d.spots.filter(Boolean).join('、') || '—' }}</div>
          <div v-if="d.hotel" class="line">住宿：{{ d.hotel }}</div>
          <div v-if="d.meals?.length" class="line">餐饮：{{ d.meals.filter(Boolean).join('、') || '—' }}</div>
        </div>
      </div>
      <p v-else class="muted">暂无行程详情</p>

      <div class="h5-feedback">
        <h3>修改反馈</h3>
        <input v-model="authorName" class="h5-input" placeholder="您的名称（可选）" />
        <textarea v-model="feedback" class="h5-input" rows="4" placeholder="请输入您的修改意见…"></textarea>
        <button class="btn btn-primary" :disabled="submitting" @click="onSend">
          {{ submitting ? '提交中…' : '提交反馈' }}
        </button>
        <p v-if="sendErr" class="err">{{ sendErr }}</p>
        <p v-if="thanks" class="thanks">感谢反馈，已提交！</p>
        <div v-if="notifyText" class="notify-box">
          <div class="notify-head">
            <span>📋 {{ notifyTip || '通知文案（去微信粘贴发给对方）' }}</span>
            <button class="btn ghost sm" @click="copyAgain">再复制</button>
          </div>
          <pre class="notify-text">{{ notifyText }}</pre>
        </div>
      </div>

      <div v-if="feedbackList.length" class="h5-fb-history">
        <h3>已提交的反馈</h3>
        <ul class="h5-fb-list">
          <li v-for="fb in feedbackList" :key="fb.id" class="h5-fb-item">
            <div class="h5-fb-meta">
              <b>{{ fb.authorName || '协作方' }}</b>
              <span class="h5-fb-time">{{ fmtTime(fb.createdAt) }}</span>
            </div>
            <p class="h5-fb-content">{{ fb.content }}</p>
          </li>
        </ul>
      </div>

      <!-- 离屏 PDF 渲染容器（导出时填充，不直接显示） -->
      <div ref="pdfWrap" class="pdf-offscreen" aria-hidden="true">
        <RoutePdf v-if="pdfModel" :model="pdfModel" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.h5 { max-width: 480px; margin: 0 auto; padding: 16px; font-family: -apple-system, "PingFang SC", sans-serif; }
.center { text-align: center; padding: 48px 0; color: var(--muted); }
.h5-card { background: var(--card); border-radius: 14px; padding: 18px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.h5-title { font-size: 22px; margin: 0 0 10px; }
.h5-meta { display: flex; flex-wrap: wrap; gap: 12px; color: var(--muted); font-size: 13px; }
.h5-price { margin: 12px 0; font-size: 16px; }
.h5-price b { color: var(--brand); }
.share-btn { width: 100%; margin-top: 14px; }
.share-tip { color: var(--success, #10b981); font-size: 13px; margin: 6px 0 0; }
.day { border-top: 1px solid var(--line); padding: 10px 0; }
.line { color: var(--ink); font-size: 14px; margin: 2px 0; }
.muted { color: var(--muted); }
.h5-feedback { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 14px; }
.h5-input { width: 100%; margin: 8px 0; padding: 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; box-sizing: border-box; font-family: inherit; }
.thanks { color: var(--ok); margin-top: 8px; }
.err { color: var(--danger); margin-top: 8px; }
.notify-box { margin-top: 12px; border: 1px solid var(--brand); border-radius: 10px; padding: 10px 12px; background: rgba(59,130,246,.06); }
.notify-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--brand); }
.notify-head .btn { margin-left: auto; }
.notify-text { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6; color: var(--ink); font-family: inherit; }
h3 { font-size: 15px; margin: 14px 0 0; }
.h5-fb-history { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 14px; }
.h5-fb-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.h5-fb-item { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
.h5-fb-meta { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.h5-fb-meta b { color: var(--ink); }
.h5-fb-time { margin-left: auto; }
.h5-fb-content { margin: 6px 0 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.pdf-tourist-panel { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; padding: 10px 12px; border: 1px solid var(--brand, #3b82f6); border-radius: 10px; background: rgba(59,130,246,.05); }
.pdf-panel-label { font-weight: 600; color: var(--muted); min-width: 36px; }
.pdf-opt { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; cursor: pointer; }
/* 离屏渲染容器：保留布局尺寸供 html2canvas 截图，并移出可视区 */
.pdf-offscreen { position: fixed; left: -10000px; top: 0; width: 794px; background: #fff; z-index: -1; }
</style>
