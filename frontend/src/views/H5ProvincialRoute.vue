<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchH5Route, submitH5Feedback, fetchH5Feedback, editH5ProvincialRoute } from '@/api/h5'
import { safeName, safeText } from '@/utils/name'
import { collabNotifyText, copyText } from '@/utils/share'
import QuoteTable from '@/components/QuoteTable.vue'
import type { H5Route, RouteFeedbackItem, QuoteLevel, RouteStatusKey } from '@/types'

const route = useRoute()
const router = useRouter()
const token = route.params.token as string
// 链接携带的可读信息（目的地 d / 客户名 c），用于微信中一眼区分与即时标题
const qDest = (route.query.d as string) || ''
const qCust = (route.query.c as string) || ''

const data = ref<H5Route | null>(null)
const notFound = ref(false)
const loading = ref(true)

// —— 行程（按天，可编辑）——
interface Day {
  day: number
  city: string
  spots: string[]
  hotel: string
  meals: string[]
}
const itinerary = ref<{ days: Day[] }>({ days: [] })
function newDay(n: number): Day {
  return { day: n, city: '', spots: [''], hotel: '', meals: [''] }
}
function parseItinerary(it: unknown) {
  const days = (it as { days?: Day[] })?.days
  if (Array.isArray(days) && days.length) {
    itinerary.value = { days: days.map((d, i) => ({ ...d, day: i + 1 })) }
  } else {
    itinerary.value = { days: [newDay(1)] }
  }
}
function addDay() {
  itinerary.value.days.push(newDay(itinerary.value.days.length + 1))
}
function removeDay(i: number) {
  itinerary.value.days.splice(i, 1)
  itinerary.value.days.forEach((d, idx) => (d.day = idx + 1))
}
function addSpot(d: Day) {
  d.spots.push('')
}
function removeSpot(d: Day, i: number) {
  d.spots.splice(i, 1)
}
function addMeal(d: Day) {
  d.meals.push('')
}
function removeMeal(d: Day, i: number) {
  d.meals.splice(i, 1)
}

// —— 回传说明（随「保存并回传一手」一并提交给一手）——
const feedbackList = ref<RouteFeedbackItem[]>([])
const fbText = ref('')
const fbErr = ref('')

// —— 成本①（省地接社按项目填写；与一手/旅行社共用同一报价表组件，利润默认 0）——
const quoteItems = ref<QuoteLevel[]>([])
const alreadySubmitted = ref(false)
const costInquiryId = ref<string | null>(null)
const totalCost = computed(() => quoteItems.value.reduce((s, it) => s + (Number(it.cost1) || 0), 0))
function normalizeCostItems(): { name: string; cost1: number }[] {
  return quoteItems.value
    .filter((it) => String(it.name).trim() || Number(it.cost1) > 0)
    .map((it) => ({ name: String(it.name || '').trim() || '未命名', cost1: Math.max(0, Number(it.cost1) || 0) }))
}

// —— 保存并通知 ——
const saving = ref(false)
const saveOk = ref('')
const saveErr = ref('')
const notifyText = ref('')
const notifyTip = ref('')

const subject = computed(() => (data.value ? safeName(data.value.customerNameCn, data.value.customerName) : qCust))
const destination = computed(() => data.value?.destination || qDest)
// 页面标题：优先服务端返回，未加载时回退到链接携带的可读信息
const pageTitle = computed(() => {
  const dest = destination.value || '定制行程'
  const who = subject.value
  return who ? `${who} · ${dest} · 省地接社协作` : `${dest} · 省地接社协作`
})

const STATUS_LABEL: Record<string, string> = {
  consulting: '咨询中',
  awaiting_pk_confirm: '待一手确认',
  awaiting_agency_revision: '待旅行社修订',
  awaiting_quote: '待报价',
  awaiting_feedback: '待反馈',
  awaiting_confirm: '待确认',
  confirmed: '已确认',
  booked: '已成单',
  pending_followup: '待跟进',
  lost: '已流失',
}

function fmtTime(s?: string): string {
  if (!s) return ''
  try {
    return new Date(s).toLocaleString()
  } catch {
    return s
  }
}

async function loadFeedback() {
  try {
    feedbackList.value = await fetchH5Feedback(token)
  } catch {
    feedbackList.value = []
  }
}

onMounted(async () => {
  // 先用链接携带的信息置标题，避免打开瞬间空白
  document.title = pageTitle.value
  try {
    const d = await fetchH5Route(token)
    data.value = d
    parseItinerary(d.itinerary)
    if (d.costInquiry) {
      costInquiryId.value = d.costInquiry.id
      if (d.costInquiry.status === 'submitted') {
        alreadySubmitted.value = true
        if (d.costInquiry.costItems && d.costInquiry.costItems.length > 0) {
          quoteItems.value = d.costInquiry.costItems.map((it) => ({
            name: it.name,
            type: 'other',
            cost1: it.amount,
            profit1Mode: 'amount',
            profit1: 0,
          }))
        } else if (d.costInquiry.cost1 != null) {
          quoteItems.value = [{ name: '地接成本', type: 'other', cost1: d.costInquiry.cost1, profit1Mode: 'amount', profit1: 0 }]
        } else {
          quoteItems.value = []
        }
      } else {
        // 未提交时给默认项目，方便按项目填写地接成本①
        quoteItems.value = [
          { name: '包车', type: 'vehicle', cost1: 0, profit1Mode: 'amount', profit1: 0 },
          { name: '酒店', type: 'hotel', cost1: 0, profit1Mode: 'amount', profit1: 0 },
          { name: '门票', type: 'ticket', cost1: 0, profit1Mode: 'amount', profit1: 0 },
        ]
      }
    }
    document.title = pageTitle.value
    await loadFeedback()
  } catch {
    notFound.value = true
    document.title = '协作链接无效 · PandaKing9'
  } finally {
    loading.value = false
  }
})

async function onSubmitHandoff() {
  saving.value = true
  saveErr.value = ''
  fbErr.value = ''
  saveOk.value = ''
  notifyText.value = ''
  try {
    const items = normalizeCostItems()
    const payload: { itinerary: unknown; items?: { name: string; cost1: number }[] } = { itinerary: itinerary.value }
    if (!alreadySubmitted.value && items.length > 0) {
      payload.items = items.map((it) => ({ name: it.name, cost1: it.cost1 }))
    }
    await editH5ProvincialRoute(token, payload)
    if (payload.items) alreadySubmitted.value = true

    // 回传说明（可选）：随本次回传一并提交给一手；失败仅提示，不阻断成本保存
    const note = fbText.value.trim()
    if (note) {
      try {
        await submitH5Feedback(token, note, '省地接社')
        fbText.value = ''
      } catch (fe: any) {
        fbErr.value = fe?.response?.data?.message || '说明提交失败（行程与成本已保存）'
      }
    }
    await loadFeedback()

    saveOk.value = note
      ? '行程、成本①与回传说明已保存并同步给一手 ✅'
      : '行程与成本①已保存并同步给一手 ✅'
    if (data.value) {
      const detail = items.length ? `成本①合计 ¥${totalCost.value.toLocaleString()}` : undefined
      const text = collabNotifyText({
        kind: 'plan',
        eventLabel: '更新了行程规划并回传成本',
        subject: subject.value,
        destination: destination.value,
        authorName: '省地接社',
        detail,
        url: window.location.href,
      })
      notifyText.value = text
      const ok = await copyText(text)
      notifyTip.value = ok
        ? '通知文案已复制，去微信粘贴发给一手同步 ✅'
        : '通知文案已生成，请长按上方文字手动复制'
    }
  } catch (e: any) {
    saveErr.value = e?.response?.data?.message || '保存失败'
  } finally {
    saving.value = false
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
      <p>协作链接无效或已失效</p>
      <p v-if="qDest || qCust" class="muted">{{ [qCust, qDest].filter(Boolean).join(' · ') }}</p>
      <button class="btn btn-primary" @click="goHome">返回工作台</button>
    </div>

    <div v-else-if="data" class="h5-card">
      <h1 class="h5-title">{{ pageTitle }}</h1>
      <div class="h5-tags">
        <span class="tag chip"><b>客户</b>{{ subject || '—' }}</span>
        <span class="tag chip"><b>目的地</b>{{ destination || '—' }}</span>
        <span class="tag chip"><b>人数</b>{{ data.groupSize }} 人</span>
        <span v-if="data.travelDate" class="tag chip"><b>出行</b>{{ data.travelDate }}</span>
        <span class="tag chip"><b>状态</b>{{ STATUS_LABEL[data.statusKey] || data.statusKey }}</span>
        <span v-if="data.guestPrice != null" class="tag chip"><b>对客总价</b>¥{{ Number(data.guestPrice).toLocaleString() }}</span>
      </div>
      <p class="hint">
        您正在以<b>省地接社</b>身份协作本路线。可修改下方的城市/景点/住宿/餐饮等当地安排，
        填写成本①，并（可选）写下回传说明；点「保存并回传一手」后，一手即可一次性同步收到行程、地接成本与说明。
      </p>

      <!-- 行程编辑 -->
      <section class="edit-block">
        <h3>行程安排（按天，可编辑）</h3>
        <div v-for="(d, di) in itinerary.days" :key="di" class="day">
          <div class="day-head">
            <b>第 {{ d.day }} 天</b>
            <button class="btn ghost sm" @click="removeDay(di)">删除当天</button>
          </div>
          <label class="f">城市<input v-model="d.city" placeholder="如 成都" /></label>
          <div class="f-block">
            <span class="lbl">景点</span>
            <div v-for="(s, si) in d.spots" :key="si" class="inline">
              <input v-model="d.spots[si]" placeholder="景点名称" />
              <button class="btn ghost sm" @click="removeSpot(d, si)">×</button>
            </div>
            <button class="btn ghost sm" @click="addSpot(d)">+ 景点</button>
          </div>
          <label class="f">住宿<input v-model="d.hotel" placeholder="酒店" /></label>
          <div class="f-block">
            <span class="lbl">餐饮</span>
            <div v-for="(m, mi) in d.meals" :key="mi" class="inline">
              <input v-model="d.meals[mi]" placeholder="餐饮安排" />
              <button class="btn ghost sm" @click="removeMeal(d, mi)">×</button>
            </div>
            <button class="btn ghost sm" @click="addMeal(d)">+ 餐饮</button>
          </div>
        </div>
        <button class="btn" @click="addDay">+ 添加一天</button>
      </section>

      <!-- 成本①（与一手/旅行社共用同一报价表；省地接社仅填成本，利润默认 0） -->
      <section class="edit-block cost">
        <h3>地接成本①</h3>
        <p class="hint">按项目填写本路线的地接成本①（仅一手可见），与行程一起提交。利润默认 0。</p>
        <QuoteTable v-model:items="quoteItems" role="provincial" />
        <p class="cost-total">合计：<b>¥{{ totalCost.toLocaleString() }}</b></p>
        <p v-if="alreadySubmitted" class="submitted-tip">✅ 您已回传过成本询价，修改后再次保存即可更新。</p>
      </section>

      <!-- 回传说明（可选，随本次回传一并发给一手） -->
      <section class="edit-block note">
        <h3>回传说明（可选）</h3>
        <p class="hint">可填写对行程规划 / 成本的补充说明，将随本次「保存并回传一手」一并同步给一手。</p>
        <textarea v-model="fbText" rows="3" placeholder="如：D3 景点太满，建议拆分到两天；或车辆需升级为9座"></textarea>
        <p v-if="fbErr" class="err">{{ fbErr }}</p>
      </section>

      <button class="btn btn-primary" :disabled="saving" @click="onSubmitHandoff">
        {{ saving ? '保存中…' : '保存并回传一手' }}
      </button>
      <p v-if="saveErr" class="err">{{ saveErr }}</p>
      <p v-if="saveOk" class="ok">{{ saveOk }}</p>

      <div v-if="notifyText" class="notify-box">
        <div class="notify-head">
          <span>📋 {{ notifyTip || '通知文案（去微信粘贴发给一手）' }}</span>
          <button class="btn ghost sm" @click="copyText(notifyText)">再复制</button>
        </div>
        <pre class="notify-text">{{ notifyText }}</pre>
      </div>

      <!-- 已回传的说明 / 建议历史 -->
      <section class="edit-block fb-history">
        <h3>已回传的说明 / 建议</h3>
        <ul v-if="feedbackList.length" class="fb-list">
          <li v-for="fb in feedbackList" :key="fb.id" class="fb-item">
            <div class="fb-meta">
              <b>{{ fb.authorName || (fb.source === 'h5' ? '协作方' : '一手地接社') }}</b>
              <span class="fb-time">{{ fmtTime(fb.createdAt) }}</span>
            </div>
            <p class="fb-content">{{ fb.content }}</p>
          </li>
        </ul>
        <p v-else class="muted">暂无回传说明。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.h5 { max-width: 480px; margin: 0 auto; padding: 16px; font-family: -apple-system, "PingFang SC", sans-serif; }
.center { text-align: center; padding: 48px 0; color: var(--muted); }
.h5-card { background: var(--card); border-radius: 14px; padding: 18px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.h5-title { font-size: 20px; margin: 0 0 10px; }
.h5-meta { display: none; }
.h5-tags { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 14px; }
.h5-tags .chip { background: #f4f5f7; border: 1px solid #e6e8eb; border-radius: 999px; padding: 4px 11px; font-size: 12px; color: #1f2329; }
.h5-tags .chip b { color: #8a9099; font-weight: 500; margin-right: 4px; }
.hint { color: var(--ink); font-size: 14px; line-height: 1.6; margin: 14px 0; }
.edit-block { margin: 16px 0; border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
.edit-block.fb { margin-top: 18px; }
.edit-block h3 { margin: 0 0 10px; font-size: 15px; }
.day { border: 1px solid var(--line); border-radius: 10px; padding: 10px; margin-bottom: 10px; }
.day-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.f { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; font-size: 13px; color: var(--muted); }
.f input { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; }
.f-block { margin: 8px 0; }
.lbl { font-size: 13px; color: var(--muted); display: block; margin-bottom: 4px; }
.inline { display: flex; gap: 6px; margin-bottom: 6px; }
.inline input { flex: 1; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; }
.btn { width: 100%; margin-top: 8px; padding: 10px; border: 1px solid var(--line-strong); background: var(--surface); border-radius: 10px; cursor: pointer; font-size: 14px; }
.btn-primary { background: var(--brand); color: #fff; border: none; padding: 12px; font-weight: 700; }
.btn-primary:disabled { opacity: 0.6; }
.btn.ghost { background: transparent; }
.btn.ghost.sm { padding: 2px 8px; font-size: 12px; width: auto; }
textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box; }
.err { color: var(--danger); margin-top: 8px; }
.ok { color: var(--ok); margin-top: 8px; }
.notify-box { margin-top: 12px; border: 1px solid var(--brand); border-radius: 10px; padding: 10px 12px; background: rgba(59,130,246,.06); }
.notify-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--brand); }
.notify-head .btn { margin-left: auto; }
.notify-text { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6; color: var(--ink); font-family: inherit; }
.fb-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.fb-item { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--card); }
.fb-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--muted); }
.fb-meta b { color: var(--ink); }
.fb-time { margin-left: auto; }
.fb-content { margin: 6px 0 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.muted { color: var(--muted); font-size: 13px; }
.cost-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.cost-row .h5-input { flex: 1; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; }
.cost-row .h5-input.name { flex: 1.5; }
.cost-row .h5-input.amount { flex: 1; }
.cost-total { margin: 8px 0; font-size: 14px; color: var(--muted); }
.cost-list { list-style: none; margin: 8px 0 0; padding: 0; }
.cost-list li { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--line); }
.cost-list li:last-child { border-bottom: none; }
.cost-name { color: var(--ink); }
.cost-amount { font-weight: 600; }
.submitted .cost-total { color: var(--ink); margin-top: 8px; }
</style>
