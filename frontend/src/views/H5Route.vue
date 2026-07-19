<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchH5Route, submitH5Feedback, fetchH5Feedback, submitH5AgencyQuote } from '@/api/h5'
import { safeText, safeName } from '@/utils/name'
import { shareH5Url, shareH5Caption, collabNotifyText, copyText } from '@/utils/share'
import type { H5Route, RouteFeedbackItem } from '@/types'
import { buildPdfModel, type PdfModel } from '@/utils/pdf-model'
import { generatePdf } from '@/utils/pdf-export'
import { PDF_LANG_OPTIONS, t, type PdfLang } from '@/utils/pdf-i18n'
import { translateText, translateEnabled } from '@/utils/pdf-translate'
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

// —— 旅行社视角：加利润② + AI 翻译泰语版 ——
const isAgencyView = computed(() => data.value?.role === 'agency')
const agProfit2Mode = ref<'amount' | 'percent'>('amount')
const agProfit2 = ref(0)
// 旅行社拿到的「成本基线」= PandaKing 报价A（后端在 role=agency 时 totals.quoteA 即为报价A）
const agQuoteA = computed(() => Number(data.value?.quote?.totals?.quoteA) || 0)
const agGuestPrice = computed(() => {
  const qa = agQuoteA.value
  const p = Number(agProfit2.value) || 0
  if (agProfit2Mode.value === 'percent') return Math.round(qa * (1 + p / 100))
  return qa + p
})
const agSaving = ref(false)
const agSaveOk = ref('')
const agSaveErr = ref('')

// —— 旅行社 AI 翻译：行程+对客总价 → 泰语版文字（供旅行社复制粘贴发客户） ——
const agThBusy = ref(false)
const agThText = ref('')
const agThErr = ref('')
// 翻译服务是否可用（VITE_TMT_ENDPOINT 配置）—— 仅展示提示，不阻断
const hasTranslate = translateEnabled()

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

// 旅行社保存利润②：凭协作 token 调用 POST /h5/route/:token/quote（免登录鉴权），
// 后端 mergeAgencyQuote 保留 PandaKing 的 items 并重算对客总价。
// ⚠️ 不再走控制台 saveVersion（会因 route.agencyId 与登录机构不一致误报「路线不存在」）。
async function onAgSave() {
  agSaving.value = true
  agSaveErr.value = ''
  agSaveOk.value = ''
  agThText.value = ''
  agThErr.value = ''
  try {
    if (!data.value) throw new Error('数据未加载')
    const res = await submitH5AgencyQuote(token, {
      profit2Mode: agProfit2Mode.value,
      profit2: Number(agProfit2.value) || 0,
    })
    // 用后端权威报价回显：更新 quoteA / 对客总价，保证与重算一致
    if (data.value.quote && res.quote?.totals) {
      ;(data.value.quote as any).totals = {
        ...(data.value.quote?.totals || {}),
        ...res.quote.totals,
      }
      if (res.quote.items) (data.value.quote as any).items = res.quote.items
    }
    const gp = res.guestPrice ?? agGuestPrice.value
    agSaveOk.value = `已保存报价（${agProfit2Mode.value === 'percent' ? `${agProfit2.value}%` : `¥${Number(agProfit2.value).toLocaleString()}`}），对客总价 ¥${Number(gp).toLocaleString()}`
  } catch (e: any) {
    agSaveErr.value = e?.response?.data?.message || e.message || '保存失败'
  } finally {
    agSaving.value = false
  }
}

// 旅行社 AI 翻译为泰语版（行程+对客总价）：调用翻译服务生成结构化泰语报价单，供旅行社复制粘贴发客户
async function onAgTranslate() {
  if (!data.value) return
  agThBusy.value = true
  agThErr.value = ''
  agThText.value = ''
  try {
    const d = data.value
    const it = (d.itinerary as { days?: any[] }) ?? {}
    const rawDays = it.days ?? []
    const lines: string[] = []
    lines.push(`【${t('th', 'itineraryTitle')}】`)
    lines.push('')

    // 逐天翻译：城市/酒店/景点/餐饮 → 泰语
    for (let i = 0; i < rawDays.length; i++) {
      const day = rawDays[i] || {}
      const dayNum = Number(day.day) || i + 1
      const [cityTr, hotelTr] = await Promise.all([
        translateText(String(day.city || ''), 'th'),
        translateText(String(day.hotel || ''), 'th'),
      ])
      const spotsTr = await Promise.all(
        ((day.spots ?? []) as string[]).map((s) => translateText(String(s || ''), 'th')),
      )
      const mealsTr = await Promise.all(
        ((day.meals ?? []) as string[]).map((m) => translateText(String(m || ''), 'th')),
      )

      lines.push(`${t('th', 'day')} ${dayNum} · ${cityTr || '—'}`)
      const spots = spotsTr.filter(Boolean)
      const meals = mealsTr.filter(Boolean)
      if (spots.length) lines.push(`  ${t('th', 'spots')}: ${spots.join('、')}`)
      if (hotelTr) lines.push(`  ${t('th', 'hotel')}: ${hotelTr}`)
      if (meals.length) lines.push(`  ${t('th', 'meals')}: ${meals.join('、')}`)
      lines.push('')
    }

    lines.push('────────────────────')
    lines.push(`${t('th', 'col_guestPrice')}: ¥${agGuestPrice.value.toLocaleString()}`)
    agThText.value = lines.join('\n')
  } catch (e: any) {
    agThErr.value = e?.message || '翻译失败'
  } finally {
    agThBusy.value = false
  }
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
    // 旅行社视角：若已有上一次的利润②（如重新打开链接），回填到输入框
    if (data.value?.role === 'agency') {
      const t = (data.value.quote as any)?.totals
      if (t) {
        agProfit2Mode.value = t.profit2Mode === 'percent' ? 'percent' : 'amount'
        agProfit2.value = Number(t.profit2) || 0
      }
    }
    // 设置浏览器标签标题，打开分享链接时显示对客标题
    const title = `${safeText(data.value.destination) || '定制行程'} · 定制行程方案`
    document.title = title
    updateOgMeta('og:title', title)
      updateOgMeta(
      'og:description',
      // 旅行社视角：突出「报价A」（他们的成本基线）；其他视角：对客总价
      data.value.role === 'agency'
        ? `PandaKing9 为您定制的${safeText(data.value.destination) || '行程'}方案，报价A ¥${(Number(data.value.quote?.totals?.quoteA) || 0).toLocaleString()}（您的成本基线）`
        : `PandaKing9 为您定制的${safeText(data.value.destination) || '行程'}方案${data.value.guestPrice != null ? `，对客总价 ¥${data.value.guestPrice.toLocaleString()}` : ''}`,
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
        travelDate: data.value.travelDate,
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

      <!-- 旅行社视角：报价A（成本基线）+ 利润② + 对客总价 -->
      <template v-if="isAgencyView">
        <div class="h5-quotea-card">
          <div class="h5-quotea-lab">报价A（您的成本基线）</div>
          <div class="h5-quotea-val">¥{{ agQuoteA.toLocaleString() }}</div>
        </div>

        <div class="h5-ag-section">
          <h3>💹 加价（利润）</h3>
          <div class="h5-ag-mode">
            <label class="h5-ag-radio">
              <input type="radio" v-model="agProfit2Mode" value="amount" /><span>固定金额 ¥</span>
            </label>
            <label class="h5-ag-radio">
              <input type="radio" v-model="agProfit2Mode" value="percent" /><span>百分比 %</span>
            </label>
          </div>
          <input
            v-model.number="agProfit2"
            type="number"
            min="0"
            class="h5-input h5-ag-input"
            :placeholder="agProfit2Mode === 'percent' ? '如 15' : '如 500'"
          />
          <div class="h5-ag-preview">
            <div class="h5-ag-row">
              <span>报价A（成本）</span>
              <span>¥{{ agQuoteA.toLocaleString() }}</span>
            </div>
            <div class="h5-ag-row">
              <span>+ 利润</span>
              <span>
                {{ agProfit2Mode === 'percent'
                  ? `${agProfit2 || 0}% = ¥${Math.round(agQuoteA * (Number(agProfit2) || 0) / 100).toLocaleString()}`
                  : `¥${(Number(agProfit2) || 0).toLocaleString()}` }}
              </span>
            </div>
            <div class="h5-ag-divider"></div>
            <div class="h5-ag-row h5-ag-total">
              <span>对客总价</span>
              <span class="h5-ag-guest">¥{{ agGuestPrice.toLocaleString() }}</span>
            </div>
          </div>

          <button class="btn btn-primary" :disabled="agSaving" @click="onAgSave">
            {{ agSaving ? '保存中…' : '💾 保存报价' }}
          </button>
          <p v-if="agSaveErr" class="err">{{ agSaveErr }}</p>
          <p v-if="agSaveOk" class="ok">{{ agSaveOk }} ✅</p>

          <!-- AI 翻译为泰语版（行程+对客总价）—— 旅行社复制粘贴发客户 -->
          <div class="h5-ag-translate">
            <button class="btn btn-primary" :disabled="agThBusy" @click="onAgTranslate">
              {{ agThBusy ? '翻译中…' : '🌐 翻译为泰语版（行程+报价）' }}
            </button>
            <p v-if="!hasTranslate" class="muted" style="font-size: 12px;">
              ⚠️ 未配置翻译服务，将以原文显示（如需配置请联系管理员设置 VITE_TMT_ENDPOINT）
            </p>
            <p v-if="agThErr" class="err">{{ agThErr }}</p>
            <div v-if="agThText" class="notify-box">
              <div class="notify-head">
                <span>🇹🇭 泰语报价单（复制粘贴发客户）</span>
                <button class="btn ghost sm" @click="copyText(agThText)">📋 复制</button>
              </div>
              <pre class="notify-text">{{ agThText }}</pre>
            </div>
          </div>
        </div>
      </template>

      <!-- 非旅行社视角：原有对客价 + 协作链接 + 反馈 -->
      <template v-else>
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
      </template>

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
.notify-text { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6; color: var(--ink); font-family: inherit; -webkit-user-select: text; user-select: text; }
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

/* —— 旅行社视角：报价A + 利润② + 对客总价 —— */
.h5-quotea-card { margin: 14px 0; padding: 14px 16px; background: #fdeef0; border-radius: 12px; display: flex; align-items: baseline; justify-content: space-between; border: 1px solid var(--brand); }
.h5-quotea-lab { color: var(--brand-600, #a60d26); font-size: 13px; font-weight: 600; }
.h5-quotea-val { color: var(--brand); font-size: 24px; font-weight: 800; }
.h5-ag-section { margin-top: 16px; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
.h5-ag-section h3 { margin-top: 0; color: var(--brand-600, #a60d26); }
.h5-ag-mode { display: flex; gap: 18px; margin: 8px 0 10px; }
.h5-ag-radio { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; font-size: 14px; color: var(--ink); }
.h5-ag-input { font-size: 16px; font-weight: 600; color: var(--brand); margin-top: 0; }
.h5-ag-preview { margin: 10px 0; padding: 10px 12px; background: #fbfcfe; border-radius: 8px; }
.h5-ag-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; color: var(--ink); }
.h5-ag-divider { border-top: 1px dashed var(--line); margin: 6px 0; }
.h5-ag-total { font-weight: 700; font-size: 15px; }
.h5-ag-guest { color: var(--brand); font-size: 18px; }
.h5-ag-customer { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--line); }
.ok { color: var(--ok, #10b981); margin-top: 8px; font-size: 13px; }

/* 离屏渲染容器：保留布局尺寸供 html2canvas 截图，并移出可视区 */
.pdf-offscreen { position: fixed; left: -10000px; top: 0; width: 794px; background: #fff; z-index: -1; }
</style>
