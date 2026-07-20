<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchH5Route, submitH5Feedback, fetchH5Feedback, editH5ProvincialRoute } from '@/api/h5'
import { shareRoute, applyCostInquiry } from '@/api/routes'
import { safeName, safeText } from '@/utils/name'
import { shareH5Url, agencyH5Url, provincialRouteH5Url, shareH5Caption, collabNotifyText, copyText, diffProvincialChanges } from '@/utils/share'
import { genUid } from '@/utils/uid'
import { useAuthStore } from '@/stores/auth'
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

// —— PandaKing 登录检测（一手打开省地接社回传 URL 时显示「回传确认+加价」视图）——
const auth = useAuthStore()
const isPk = computed(() => auth.user?.role === 'pandaking')
// PandaKing 视角按询价状态拆分：
//  - 已回传（submitted）→ 加价 + 生成对旅行社链接
//  - 未回传（pending/其他）→ 等待回传提示 + 行程只读预览（不显示加价，因为没成本①）
const pkReady = computed(() => isPk.value && data.value?.costInquiry?.status === 'submitted')
const pkPending = computed(() => isPk.value && data.value?.costInquiry?.status !== 'submitted')

// —— PandaKing 加价 & 生成对旅行社链接 ——
const pkProfit1Mode = ref<'amount' | 'percent'>('amount')
const pkProfit1 = ref(0)
const pkQuoteA = computed(() => {
  const totalCost1 = (data.value?.costInquiry?.costItems ?? []).reduce((s, it) => s + (Number(it.amount) || 0), 0)
    || Number(data.value?.costInquiry?.cost1) || 0
  const profit = pkProfit1Mode.value === 'percent'
    ? Math.round(totalCost1 * (Number(pkProfit1.value) || 0) / 100)
    : (Number(pkProfit1.value) || 0)
  return totalCost1 + profit
})
const pkGenLoading = ref(false)
const pkGeneratedText = ref('')
const pkGeneratedTip = ref('')
// 断点1 修复：PandaKing 在回传确认视图内「保存并回传省地接社」的状态
const pkHandoffLoading = ref(false)
const pkHandoffText = ref('')
const pkHandoffTip = ref('')

// —— 行程（按天，可编辑，折叠展开）——
interface Day {
  day: number
  city: string
  spots: string[]
  hotel: string
  meals: string[]
}
const itinerary = ref<{ days: Day[] }>({ days: [] })
const openDays = ref(new Set<number>()) // 展开的天数索引
function toggleDay(di: number) {
  const s = new Set(openDays.value)
  if (s.has(di)) s.delete(di); else s.add(di)
  openDays.value = s
}
function countNonEmpty(arr: string[]): number {
  return arr.filter((x) => String(x).trim()).length
}
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
  const di = itinerary.value.days.length
  itinerary.value.days.push(newDay(di + 1))
  // 自动展开新天
  const s = new Set(openDays.value)
  s.add(di)
  openDays.value = s
}
function removeDay(i: number) {
  itinerary.value.days.splice(i, 1)
  itinerary.value.days.forEach((d, idx) => (d.day = idx + 1))
  const s = new Set(openDays.value)
  s.delete(i)
  // 调整后续索引
  const adjusted = new Set<number>()
  for (const idx of s) {
    adjusted.add(idx > i ? idx - 1 : idx)
  }
  openDays.value = adjusted
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
// 回传前的基线快照：用于多轮回传时计算「关键变更摘要」（与一手逐轮核对）
const initialCostItems = ref<{ name: string; cost1: number }[]>([])
const initialItinerary = ref<{ days: { day: number; city: string }[] }>({ days: [] })
function normalizeCostItems(): { name: string; cost1: number }[] {
  return quoteItems.value
    .filter((it) => String(it.name).trim() || Number(it.cost1) > 0)
    .map((it) => ({ name: String(it.name || '').trim() || '未命名', cost1: Math.max(0, Number(it.cost1) || 0) }))
}

// —— 实时变更检测（问题3：自动记录变动，展示到页面）——
const currentChanges = computed(() => {
  const afterItems = normalizeCostItems()
  const afterItinerary = { days: itinerary.value.days.map((d) => ({ day: d.day, city: d.city })) }
  return diffProvincialChanges({
    beforeItems: initialCostItems.value,
    afterItems,
    beforeItinerary: initialItinerary.value,
    afterItinerary,
    versionLabel: undefined,
  })
})
const hasCostChange = computed(() => {
  const ch = currentChanges.value.cost
  return ch && ch.items.length > 0
})
const hasItineraryChange = computed(() => {
  const ch = currentChanges.value.itinerary
  return ch && ch.cityChanges && ch.cityChanges.length > 0
})
const hasAnyChange = computed(() => hasCostChange.value || hasItineraryChange.value)

// 变更摘要文本（用于显示在页面 + 自动提交反馈）
function changeSummaryText(): string {
  const ch = currentChanges.value
  const lines: string[] = ['【本轮变更摘要】']
  if (ch.cost && ch.cost.items.length > 0) {
    const totalChange = ch.cost.totalAfter - ch.cost.totalBefore
    const sign = totalChange >= 0 ? '+' : ''
    lines.push(`成本①合计：¥${ch.cost.totalBefore.toLocaleString()} → ¥${ch.cost.totalAfter.toLocaleString()} (${sign}¥${totalChange.toLocaleString()})`)
    for (const it of ch.cost.items.slice(0, 10)) {
      if (it.isNew) lines.push(`  + ${it.name}：¥${it.after.toLocaleString()}(新增)`)
      else lines.push(`  · ${it.name}：¥${it.before.toLocaleString()} → ¥${it.after.toLocaleString()}`)
    }
  }
  if (ch.itinerary && ch.itinerary.cityChanges && ch.itinerary.cityChanges.length > 0) {
    const dayDelta = ch.itinerary.dayDelta
    const daysText = dayDelta !== 0
      ? `（天数：${ch.itinerary.dayCountBefore}天 → ${ch.itinerary.dayCountAfter}天${dayDelta > 0 ? `，+${dayDelta}` : dayDelta}天）`
      : ''
    lines.push(`行程调整${daysText}`)
    for (const c of ch.itinerary.cityChanges.slice(0, 15)) {
      lines.push(`  ${c}`)
    }
  }
  return lines.join('\n')
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
      }
    }
    // 省地接社可编辑报价项：以「当前 routeVersion 的报价项（provincial 角色过滤后仅含 name/type/cost1）」为准。
    // 不再用 costInquiry.costItems 旧快照——那样多轮往返时一手新增/调整的报价项会在省地接社侧被漏掉。
    // costInquiry 仅承载协作记录与提交状态，不是省地接社协作页的实时数据源。
    if (d.quote?.items?.length) {
      quoteItems.value = d.quote.items.map((it) => ({
        uid: (it as any).uid || genUid(),
        name: String(it.name ?? ''),
        type: it.type || 'other',
        cost1: Number(it.cost1) || 0,
        profit1Mode: 'amount',
        profit1: 0,
      })) as QuoteLevel[]
    } else {
      // 路线尚无任何报价项时给默认项目，方便从零填写地接成本①
      quoteItems.value = [
        { uid: genUid(), name: '包车', type: 'vehicle', cost1: 0, profit1Mode: 'amount', profit1: 0 },
        { uid: genUid(), name: '酒店', type: 'hotel', cost1: 0, profit1Mode: 'amount', profit1: 0 },
        { uid: genUid(), name: '门票', type: 'ticket', cost1: 0, profit1Mode: 'amount', profit1: 0 },
      ]
    }
    // 记录回传前基线（多轮协作：用于生成本轮关键变更摘要）
    initialCostItems.value = quoteItems.value.map((i) => ({ name: String(i.name || ''), cost1: Number(i.cost1) || 0 }))
    initialItinerary.value = { days: itinerary.value.days.map((d) => ({ day: d.day, city: d.city })) }
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
    // 多轮协作：每轮都回传成本①（含变更），让一手逐轮核对价格变化，而非仅首次
    if (items.length > 0) {
      payload.items = items.map((it) => ({ name: it.name, cost1: it.cost1 }))
    }
    await editH5ProvincialRoute(token, payload)
    if (payload.items) alreadySubmitted.value = true

    // 【问题3】自动提交变更摘要作为反馈记录
    const autoNote = changeSummaryText()
    // 合并手动 + 自动
    const manual = fbText.value.trim()
    const combinedNote = manual
      ? (hasAnyChange.value ? `${autoNote}\n\n【补充说明】${manual}` : manual)
      : (hasAnyChange.value ? autoNote : '')
    if (combinedNote) {
      try {
        await submitH5Feedback(token, combinedNote, '省地接社')
        fbText.value = ''
        // 更新基线（下一轮基于新基线检测变更）
        initialCostItems.value = items.map((i) => ({ ...i }))
        initialItinerary.value = { days: itinerary.value.days.map((d) => ({ day: d.day, city: d.city })) }
      } catch (fe: any) {
        fbErr.value = fe?.response?.data?.message || '变更记录提交失败（行程与成本已保存）'
      }
    } else if (manual) {
      try {
        await submitH5Feedback(token, manual, '省地接社')
        fbText.value = ''
      } catch (fe: any) {
        fbErr.value = fe?.response?.data?.message || '说明提交失败（行程与成本已保存）'
      }
    }
    await loadFeedback()

    saveOk.value = combinedNote
      ? '行程、成本①与变更记录已保存并同步给一手 ✅'
      : '行程与成本①已保存并同步给一手 ✅'
    if (data.value) {
      // 多轮协作：计算本轮关键变更摘要，让一手一眼看清改了哪些价格/行程
      const afterItinerary = { days: itinerary.value.days.map((d) => ({ day: d.day, city: d.city })) }
      const changes = diffProvincialChanges({
        beforeItems: initialCostItems.value,
        afterItems: items,
        beforeItinerary: initialItinerary.value,
        afterItinerary,
        versionLabel: data.value.version ?? undefined,
      })
      const text = collabNotifyText({
        kind: 'plan',
        eventLabel: '更新了行程规划并回传成本',
        subject: subject.value,
        destination: destination.value,
        travelDate: data.value?.travelDate,
        authorName: '省地接社',
        changes,
        url: window.location.href,
      })
      notifyText.value = text
      const ok = await copyText(text)
      notifyTip.value = ok
        ? '通知文案已复制，去微信粘贴发给一手同步 ✅'
        : '通知文案已生成，请长按上方文字手动复制'
    }
  } catch (e: any) {
    // 自诊断：把真实失败原因透出，避免永远只显示「保存失败」。
    const resp = e?.response
    const status = resp?.status
    const data = resp?.data
    if (resp == null) {
      saveErr.value = '保存失败：网络层无响应（疑似 CORS 预检被拦截，或 /api 代理未覆盖该路径）'
    } else if (typeof data === 'string') {
      saveErr.value = `保存失败（HTTP ${status}）：后端返回了非 JSON（疑似被静态托管 SPA 回源重写 /* → /index.html 吞掉，请检查 CloudBase /api 代理是否覆盖 POST）`
    } else if (data && data.message) {
      saveErr.value = `保存失败（${status}）：${data.message}`
    } else {
      saveErr.value = `保存失败（HTTP ${status ?? '未知'}）`
    }
    console.error('[provincial save]', e)
  } finally {
    saving.value = false
  }
}

function goHome() {
  router.push('/routes/kanban')
}

// PandaKing 生成对旅行社链接：应用成本① → 创建 share（role=agency, public=false，让旅行社在 H5 SPA 上加利润②）→ 复制文案+URL
async function onPkGenerateLink() {
  pkGenLoading.value = true
  pkGeneratedText.value = ''
  pkGeneratedTip.value = ''
  try {
    const routeId = data.value?.routeId
    const inquiryId = data.value?.costInquiry?.id
    if (!routeId) { pkGeneratedTip.value = '路线 ID 不存在'; pkGenLoading.value = false; return }

    // 1) 应用成本①到路线版本（确保 agency 看到的报价A 是基于真实成本①）
    if (inquiryId) {
      await applyCostInquiry(inquiryId)
    }

    // 2) 创建 agency 分享：role='agency'（按 role 做字段级可见性），
    //    public=false（不是客户只读页，而是旅行社可加利润② 的交互页）
    const share = await shareRoute(routeId, 'agency', false)

    // 3) 构造通知文案：主题+报价A+URL。
    //    ⚠️ 不暴露「成本①」「利润①」等 PandaKing 内部数据（PRD 隔离矩阵 + agency↔provincial 物理隔绝）。
    //    「报价A」是旅行社的「成本基线」，告诉旅行社无妨（但不是对客价，对客价由旅行社加完利润② 后得出）。
    const link = agencyH5Url(share.token)
    const caption = shareH5Caption(data.value ?? undefined)
    const text = `${caption}\n报价A ¥${pkQuoteA.value.toLocaleString()}\n\n👉 查看并加价回复：${link}`
    pkGeneratedText.value = text

    // 4) 自动复制到剪贴板
    const ok = await copyText(text)
    pkGeneratedTip.value = ok
      ? '✅ 通知文案已复制，去微信粘贴发给境外旅行社'
      : '已生成，请手动复制下方文案'
  } catch (e: any) {
    pkGeneratedTip.value = `生成失败：${e?.response?.data?.message || e.message || '未知错误'}`
    console.error('[pk generate link]', e)
  } finally {
    pkGenLoading.value = false
  }
}

// 断点1 修复：PandaKing 在「回传确认」视图内，把调整后的行程「保存并回传省地接社」，
// 形成微信 H5 链路 一手→省地接社 的多轮往返闭环。
// ⚠️ 仅传行程（不传成本①：成本①归省地接社专属；利润①归一手专属），后端 provincialEdit
// 据此生成新版本并同步省地接社/一手令牌指向新版（见 routes.service.ts 的版本同步逻辑）。
async function onPkHandoffToProvincial() {
  pkHandoffLoading.value = true
  pkHandoffText.value = ''
  pkHandoffTip.value = ''
  try {
    await editH5ProvincialRoute(token, { itinerary: itinerary.value })
    const link = provincialRouteH5Url(token)
    const text = collabNotifyText({
      kind: 'plan',
      eventLabel: '调整行程并回传省地接社',
      subject: subject.value,
      destination: destination.value,
      travelDate: data.value?.travelDate,
      authorName: '一手 PandaKing',
      url: link,
    })
    pkHandoffText.value = text
    const ok = await copyText(text)
    pkHandoffTip.value = ok
      ? '✅ 通知文案已复制，去微信粘贴发给省地接社'
      : '已生成，请手动复制下方文案'
  } catch (e: any) {
    pkHandoffTip.value = `回传失败：${e?.response?.data?.message || e.message || '未知错误'}`
    console.error('[pk handoff to provincial]', e)
  } finally {
    pkHandoffLoading.value = false
  }
}

// PandaKing 快速跳转到路线详情页（完整编辑）
function goRouteDetail() {
  const id = data.value?.routeId
  if (id) router.push(`/routes/${id}`)
}
</script>

<template>
  <div class="prov-page">
    <div v-if="loading" class="center">加载中…</div>

    <div v-else-if="notFound" class="center">
      <p>协作链接无效或已失效</p>
      <p v-if="qDest || qCust" class="muted">{{ [qCust, qDest].filter(Boolean).join(' · ') }}</p>
      <button class="btn btn-primary" @click="goHome">返回工作台</button>
    </div>

    <!-- ============ 省地接社主内容区（角色分支） ============ -->
    <template v-else-if="data && isPk && pkReady">
      <!-- ═══════════ PandaKing 视角（已回传）：回传确认 + 加价 + 生成对旅行社链接 ═══════════ -->
      <div class="prov-content pk-view">

        <!-- ── 头部标识 ── -->
        <div class="prov-header">
          <h1 class="prov-title">省地接社回传确认</h1>
          <div class="prov-chips">
            <span class="chip"><b>客户</b>{{ subject || '—' }}</span>
            <span class="chip"><b>目的地</b>{{ destination || '—' }}</span>
            <span class="chip"><b>省地接社</b>已回传成本</span>
            <span class="chip pk-chip">👑 PandaKing 加价</span>
          </div>
        </div>

        <div class="prov-columns">
          <!-- ════ 左栏：行程（可编辑）+ 成本（只读） ════ -->
          <div class="prov-left">

            <p class="hint">
              省地接社已回传行程与成本①。您可以直接调整行程，设置利润后生成<b>对旅行社的 H5 链接</b>，
              粘贴到微信发给境外旅行社。
            </p>

            <!-- ── 行程安排（可编辑折叠） ── -->
            <section class="prov-section itinerary-section">
              <div class="section-head">
                <h3>省地接社提交的行程（可编辑）</h3>
                <span class="pill sm st-neutral">共 {{ itinerary.days.length }} 天</span>
              </div>
              <div v-for="(d, di) in itinerary.days" :key="di" class="day-card">
                <div class="day-row" @click="toggleDay(di)" role="button" tabindex="0" @keydown.enter="toggleDay(di)">
                  <div class="day-badge">D{{ d.day }}</div>
                  <div class="day-summary">
                    <span class="day-city">{{ d.city || `第 ${d.day} 天` }}</span>
                    <span class="day-meta">
                      <span v-if="d.hotel" class="day-tag">{{ d.hotel }}</span>
                      <span class="day-tag">{{ countNonEmpty(d.spots) }} 处景点</span>
                      <span class="day-tag">{{ countNonEmpty(d.meals) }} 项用餐</span>
                    </span>
                  </div>
                  <div class="day-chev" :class="{ open: openDays.has(di) }">▾</div>
                </div>
                <div v-show="openDays.has(di)" class="day-edit">
                  <div class="day-field-row">
                    <div class="day-field"><label>城市 / 区域</label><input v-model="d.city" placeholder="如 成都" /></div>
                    <div class="day-field"><label>住宿酒店</label><input v-model="d.hotel" placeholder="酒店" /></div>
                  </div>
                  <div class="day-field full">
                    <label>景点 / 活动</label>
                    <div v-for="(s, si) in d.spots" :key="si" class="day-inline-row">
                      <input v-model="d.spots[si]" placeholder="景点名称" />
                      <button class="btn ghost xs" @click="removeSpot(d, si)">×</button>
                    </div>
                    <button class="btn ghost sm" @click="addSpot(d)">+ 添加景点</button>
                  </div>
                  <div class="day-field full">
                    <label>餐饮安排</label>
                    <div v-for="(m, mi) in d.meals" :key="mi" class="day-inline-row">
                      <input v-model="d.meals[mi]" placeholder="餐饮安排" />
                      <button class="btn ghost xs" @click="removeMeal(d, mi)">×</button>
                    </div>
                    <button class="btn ghost sm" @click="addMeal(d)">+ 添加餐饮</button>
                  </div>
                  <div class="day-actions">
                    <button class="btn ghost sm" @click="removeDay(di)">删除当天</button>
                  </div>
                </div>
              </div>
              <button class="btn dash" @click="addDay">+ 添加一天</button>
            </section>

            <!-- ── 已回传成本①（只读） ── -->
            <section class="prov-section cost-section pk-cost-readonly">
              <h3>省地接社提交的成本①</h3>
              <p class="hint">以下为省地接社回传的成本明细（仅一手可见）。</p>
              <div class="pk-cost-tbl">
                <div class="pk-cost-head"><span>项目</span><span>成本①</span></div>
                <div v-for="(it, ii) in (data.costInquiry?.costItems ?? [])" :key="ii" class="pk-cost-row">
                  <span>{{ it.name }}</span>
                  <span>¥{{ Number(it.amount).toLocaleString() }}</span>
                </div>
                <!-- 兼容旧数据：只有 cost1 无 costItems -->
                <div v-if="!(data.costInquiry?.costItems?.length) && data.costInquiry?.cost1 != null" class="pk-cost-row">
                  <span>省地接社成本①</span>
                  <span>¥{{ Number(data.costInquiry.cost1).toLocaleString() }}</span>
                </div>
                <div class="pk-cost-total">
                  <span>合计</span>
                  <span class="pk-cost-amt">
                    ¥{{ ((data.costInquiry?.costItems ?? []).reduce((s, it) => s + (Number(it.amount) || 0), 0)
                      || Number(data.costInquiry?.cost1) || 0).toLocaleString() }}
                  </span>
                </div>
              </div>
            </section>
          </div>

          <!-- ════ 右栏：利润设置 + 生成链接 + 文案 ════ -->
          <div class="prov-right">

            <!-- ── 设置利润 ── -->
            <section class="prov-section pk-profit-section">
              <h3>💹 设置利润（加价）</h3>
              <div class="pk-profit-form">
                <div class="pk-profit-mode">
                  <label class="pk-radio">
                    <input type="radio" v-model="pkProfit1Mode" value="amount" />
                    <span>固定金额</span>
                  </label>
                  <label class="pk-radio">
                    <input type="radio" v-model="pkProfit1Mode" value="percent" />
                    <span>百分比</span>
                  </label>
                </div>
                <div class="pk-profit-input">
                  <input
                    v-model.number="pkProfit1"
                    type="number"
                    min="0"
                    :placeholder="pkProfit1Mode === 'percent' ? '如 15' : '如 500'"
                  />
                  <span class="pk-profit-unit">{{ pkProfit1Mode === 'percent' ? '%' : '¥' }}</span>
                </div>
              </div>
              <div class="pk-quote-preview">
                <div class="pk-qp-row"><span>成本①</span><span>¥{{ ((data.costInquiry?.costItems ?? []).reduce((s, it) => s + (Number(it.amount) || 0), 0) || Number(data.costInquiry?.cost1) || 0).toLocaleString() }}</span></div>
                <div class="pk-qp-row pk-qp-profit">
                  <span>+ 利润</span>
                  <span>
                    <template v-if="pkProfit1Mode === 'percent'">
                      {{ pkProfit1 || 0 }}%
                      = ¥{{ Math.round(((data.costInquiry?.costItems ?? []).reduce((s, it) => s + (Number(it.amount) || 0), 0) || Number(data.costInquiry?.cost1) || 0) * (Number(pkProfit1) || 0) / 100).toLocaleString() }}
                    </template>
                    <template v-else>
                      ¥{{ (Number(pkProfit1) || 0).toLocaleString() }}
                    </template>
                  </span>
                </div>
                <div class="pk-qp-divider"></div>
                <div class="pk-qp-row pk-qp-total">
                  <span>报价A（对旅行社）</span>
                  <span class="pk-quote-amt">¥{{ pkQuoteA.toLocaleString() }}</span>
                </div>
              </div>
            </section>

            <!-- ── 保存并回传省地接社（断点1 修复：一手→省地接社 多轮往返）── -->
            <button class="btn btn-primary pk-handoff-btn" :disabled="pkHandoffLoading" @click="onPkHandoffToProvincial">
              {{ pkHandoffLoading ? '回传中…' : '💾 保存并回传省地接社' }}
            </button>
            <p v-if="pkHandoffTip && !pkHandoffText" class="err">{{ pkHandoffTip }}</p>
            <div v-if="pkHandoffText" class="notify-box">
              <div class="notify-head">
                <span>{{ pkHandoffTip || '已回传' }}</span>
                <button class="btn ghost sm" @click="copyText(pkHandoffText)">再复制</button>
              </div>
              <pre class="notify-text">{{ pkHandoffText }}</pre>
            </div>

            <!-- ── 生成对旅行社链接 ── -->
            <button class="btn btn-primary pk-gen-btn" :disabled="pkGenLoading" @click="onPkGenerateLink">
              {{ pkGenLoading ? '生成中…' : '🚀 生成对旅行社链接' }}
            </button>
            <p v-if="pkGeneratedTip && !pkGeneratedText" class="err">{{ pkGeneratedTip }}</p>

            <!-- ── 生成的文案 ── -->
            <div v-if="pkGeneratedText" class="notify-box">
              <div class="notify-head">
                <span>{{ pkGeneratedTip || '已生成' }}</span>
                <button class="btn ghost sm" @click="copyText(pkGeneratedText)">再复制</button>
              </div>
              <pre class="notify-text">{{ pkGeneratedText }}</pre>
            </div>

            <!-- ── 跳转完整编辑 ── -->
            <p class="pk-nav-hint">
              <a href="javascript:void(0)" @click="goRouteDetail">→ 去路线详情页完整编辑行程与报价</a>
            </p>

          </div>
        </div>
      </div>
    </template>

    <!-- ============ PandaKing 视角（未回传）：等待省地接社回传成本① ============ -->
    <template v-else-if="data && isPk && pkPending">
      <div class="prov-content pk-view pk-pending">
        <!-- ── 头部标识 ── -->
        <div class="prov-header">
          <h1 class="prov-title">⏳ 等待省地接社回传成本①</h1>
          <div class="prov-chips">
            <span class="chip"><b>客户</b>{{ subject || '—' }}</span>
            <span class="chip"><b>目的地</b>{{ destination || '—' }}</span>
            <span class="chip"><b>状态</b>已发起询价，等待省地接社回传</span>
          </div>
        </div>

        <p class="hint pk-pending-tip">
          询价链接已生成并发给省地接社。对方在微信打开此链接、填写成本①并回传后，<br/>
          您可在此页面设置利润、生成对旅行社的 H5 链接。<br/>
          <b>当前阶段尚无成本①，无需加价。</b>
        </p>

        <!-- ── 行程只读预览 ── -->
        <section class="prov-section itinerary-section">
          <div class="section-head">
            <h3>行程安排（只读预览）</h3>
            <span class="pill sm st-neutral">共 {{ itinerary.days.length }} 天</span>
          </div>
          <div v-for="(d, di) in itinerary.days" :key="di" class="day-card">
            <div class="day-row">
              <div class="day-badge">D{{ d.day }}</div>
              <div class="day-summary">
                <span class="day-city">{{ d.city || `第 ${d.day} 天` }}</span>
                <span class="day-meta">
                  <span v-if="d.hotel" class="day-tag">{{ d.hotel }}</span>
                  <span class="day-tag">{{ countNonEmpty(d.spots) }} 处景点</span>
                  <span class="day-tag">{{ countNonEmpty(d.meals) }} 项用餐</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <p class="pk-nav-hint">
          <a href="javascript:void(0)" @click="goRouteDetail">→ 去路线详情页完整编辑行程与报价</a>
        </p>
      </div>
    </template>

    <!-- ============ 省地接社主内容区（非 PandaKing：省地接社编辑页）============ -->
    <template v-else-if="data && !isPk">
      <div class="prov-content">

      <!-- ────── 头部信息 ────── -->
      <div class="prov-header">
        <h1 class="prov-title">{{ pageTitle }}</h1>
        <div class="prov-chips">
          <span class="chip"><b>客户</b>{{ subject || '—' }}</span>
          <span class="chip"><b>目的地</b>{{ destination || '—' }}</span>
          <span class="chip"><b>人数</b>{{ data.groupSize }} 人</span>
          <span v-if="data.travelDate" class="chip"><b>出行</b>{{ data.travelDate }}</span>
          <span class="chip"><b>状态</b>{{ STATUS_LABEL[data.statusKey] || data.statusKey }}</span>
          <span v-if="data.guestPrice != null" class="chip"><b>对客总价</b>¥{{ Number(data.guestPrice).toLocaleString() }}</span>
        </div>
      </div>

      <!-- ────── 双栏布局（手机 ↓↓ / PC →→） ────── -->
      <div class="prov-columns">
        <!-- ════ 左栏：行程 & 成本 ════ -->
        <div class="prov-left">

          <!-- 提示 -->
          <p class="hint">
            您正在以<b>省地接社</b>身份与一手 PandaKing 协作本路线（支持<b>多轮反复沟通</b>）。
            点击每日行程可展开编辑；修改后系统自动记录变更摘要。每轮点「保存并回传一手」，一手都会收到带<b>关键变更摘要</b>的通知。
          </p>

          <!-- ──── 行程安排（折叠展开） ──── -->
          <section class="prov-section itinerary-section">
            <div class="section-head">
              <h3>行程安排（按天，可编辑）</h3>
              <span class="pill sm st-neutral">共 {{ itinerary.days.length }} 天</span>
            </div>
            <div v-for="(d, di) in itinerary.days" :key="di" class="day-card">
              <!-- 折叠摘要行 -->
              <div class="day-row" @click="toggleDay(di)" role="button" tabindex="0" @keydown.enter="toggleDay(di)">
                <div class="day-badge">D{{ d.day }}</div>
                <div class="day-summary">
                  <span class="day-city">{{ d.city || `第 ${d.day} 天` }}</span>
                  <span class="day-meta">
                    <span v-if="d.hotel" class="day-tag">{{ d.hotel }}</span>
                    <span class="day-tag">{{ countNonEmpty(d.spots) }} 处景点</span>
                    <span class="day-tag">{{ countNonEmpty(d.meals) }} 项用餐</span>
                  </span>
                </div>
                <div class="day-chev" :class="{ open: openDays.has(di) }">▾</div>
              </div>
              <!-- 展开编辑区 -->
              <div v-show="openDays.has(di)" class="day-edit">
                <div class="day-field-row">
                  <div class="day-field"><label>城市 / 区域</label><input v-model="d.city" placeholder="如 成都" /></div>
                  <div class="day-field"><label>住宿酒店</label><input v-model="d.hotel" placeholder="酒店" /></div>
                </div>
                <div class="day-field full">
                  <label>景点 / 活动</label>
                  <div v-for="(s, si) in d.spots" :key="si" class="day-inline-row">
                    <input v-model="d.spots[si]" placeholder="景点名称" />
                    <button class="btn ghost xs" @click="removeSpot(d, si)">×</button>
                  </div>
                  <button class="btn ghost sm" @click="addSpot(d)">+ 添加景点</button>
                </div>
                <div class="day-field full">
                  <label>餐饮安排</label>
                  <div v-for="(m, mi) in d.meals" :key="mi" class="day-inline-row">
                    <input v-model="d.meals[mi]" placeholder="餐饮安排" />
                    <button class="btn ghost xs" @click="removeMeal(d, mi)">×</button>
                  </div>
                  <button class="btn ghost sm" @click="addMeal(d)">+ 添加餐饮</button>
                </div>
                <div class="day-actions">
                  <button class="btn ghost sm" @click="removeDay(di)">删除当天</button>
                </div>
              </div>
            </div>
            <button class="btn dash" @click="addDay">+ 添加一天</button>
          </section>

          <!-- ──── 成本① ──── -->
          <section class="prov-section cost-section">
            <h3>地接成本①</h3>
            <p class="hint">按项目填写本路线的地接成本①（仅一手可见），与行程一起提交。</p>
            <QuoteTable v-model:items="quoteItems" role="provincial" />
            <p class="cost-total">合计：<b>¥{{ totalCost.toLocaleString() }}</b></p>
            <p v-if="alreadySubmitted" class="submitted-tip">✅ 您已回传过成本询价，修改后再次保存即可更新。</p>
          </section>

        </div>

        <!-- ════ 右栏：变更摘要 & 回传说明 & 保存栏 & 历史 ════ -->
        <div class="prov-right">

          <!-- ──── 本轮变更摘要（问题3：自动检测 + 展示） ──── -->
          <section v-if="hasAnyChange" class="prov-section changes-summary">
            <h3>📋 本轮变更摘要</h3>
            <p class="hint">系统自动检测到以下变动，保存后将记录为回传说明。</p>
            <div v-if="hasCostChange" class="ch-block">
              <span class="ch-label">成本①</span>
              <span class="ch-detail">
                ¥{{ Number(currentChanges.cost?.totalBefore).toLocaleString() }} → ¥{{ Number(currentChanges.cost?.totalAfter).toLocaleString() }}
                <span v-if="currentChanges.cost" :class="(currentChanges.cost.totalAfter - currentChanges.cost.totalBefore) >= 0 ? 'ch-up' : 'ch-down'">
                  {{ (currentChanges.cost.totalAfter - currentChanges.cost.totalBefore) >= 0 ? '↑' : '↓' }}
                  ¥{{ Math.abs(currentChanges.cost.totalAfter - currentChanges.cost.totalBefore).toLocaleString() }}
                </span>
              </span>
            </div>
            <div v-if="hasItineraryChange" class="ch-block">
              <span class="ch-label">行程</span>
              <span class="ch-detail">
                {{ currentChanges.itinerary?.dayCountAfter }} 天
                <template v-if="currentChanges.itinerary && currentChanges.itinerary.dayDelta !== 0">
                  （{{ currentChanges.itinerary.dayDelta > 0 ? '+' : '' }}{{ currentChanges.itinerary.dayDelta }} 天）
                </template>
                <span v-if="currentChanges.itinerary?.cityChanges" class="ch-city-list">
                  <span v-for="c in currentChanges.itinerary.cityChanges" :key="c" class="ch-city-tag">{{ c }}</span>
                </span>
              </span>
            </div>
          </section>

          <!-- ──── 回传说明（手动补充） ──── -->
          <section class="prov-section note-section">
            <h3>回传说明（可选）</h3>
            <p class="hint">
              如有额外说明，可在此补充。<template v-if="hasAnyChange">变更摘要将自动合并提交，无需重复填写。</template>
            </p>
            <textarea v-model="fbText" rows="3" placeholder="如：D3 景点太满，建议拆分到两天；或车辆需升级为9座"></textarea>
            <p v-if="fbErr" class="err">{{ fbErr }}</p>
          </section>

          <!-- ──── 保存按钮 ──── -->
          <button class="btn btn-primary" :disabled="saving" @click="onSubmitHandoff">
            {{ saving ? '保存中…' : '保存并回传一手' }}
          </button>
          <p v-if="saveErr" class="err">{{ saveErr }}</p>
          <p v-if="saveOk" class="ok">{{ saveOk }}</p>

          <div v-if="notifyText" class="notify-box">
            <div class="notify-head">
              <span>{{ notifyTip || '通知文案（去微信粘贴发给一手）' }}</span>
              <button class="btn ghost sm" @click="copyText(notifyText)">再复制</button>
            </div>
            <pre class="notify-text">{{ notifyText }}</pre>
          </div>

          <!-- ──── 已回传的记录 ──── -->
          <section class="prov-section fb-history">
            <div class="section-head">
              <h3>已回传的记录</h3>
              <span v-if="feedbackList.length" class="pill xs st-role">{{ feedbackList.length }}</span>
            </div>
            <ul v-if="feedbackList.length" class="fb-list">
              <li v-for="fb in feedbackList" :key="fb.id" class="fb-item">
                <div class="fb-meta">
                  <b>{{ fb.authorName || (fb.source === 'h5' ? '协作方' : '一手地接社') }}</b>
                  <span class="pill xs st-awaiting_quote">回传说明</span>
                  <span class="fb-time">{{ fmtTime(fb.createdAt) }}</span>
                </div>
                <p class="fb-content">{{ fb.content }}</p>
              </li>
            </ul>
            <p v-else class="muted">暂无回传记录。</p>
          </section>

        </div>
      </div>
    </div>
</template>

</div>
</template>

<style scoped>
/* ============================================================
   省地接社协作页面（响应式：手机 < 768px / PC ≥ 768px）
   原则：手机单栏卡片，PC 两栏 + 系统品牌色块
   ============================================================ */

/* ── 基础共用 ── */
.prov-page { font-family: -apple-system, "PingFang SC", sans-serif; padding: 16px; }
.center { text-align: center; padding: 48px 0; color: var(--muted); }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── 手机优先（<768px） ── */
.prov-content { max-width: 520px; margin: 0 auto; }
.prov-header { margin-bottom: 16px; }
.prov-title { font-size: 20px; margin: 0 0 10px; color: var(--ink); }
.prov-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.prov-chips .chip { background: #f4f5f7; border: 1px solid #e6e8eb; border-radius: 999px; padding: 4px 11px; font-size: 12px; color: #1f2329; }
.prov-chips .chip b { color: #8a9099; font-weight: 500; margin-right: 4px; }
.prov-columns { display: block; }
.prov-left, .prov-right { width: 100%; }
.hint { color: var(--muted); font-size: 14px; line-height: 1.6; margin: 0 0 16px; }

/* ── 区块卡片 ── */
.prov-section { margin: 0 0 16px; border: 1px solid var(--line); border-radius: 10px; padding: 12px; background: var(--surface); }
.prov-section h3 { margin: 0 0 10px; font-size: 15px; color: var(--ink); }
.section-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.section-head h3 { margin-bottom: 0; }

/* ── pill 标签 ── */
.pill { display: inline-flex; align-items: center; border-radius: 999px; font-size: 12px; white-space: nowrap; }
.pill.sm { padding: 3px 10px; }
.pill.xs { padding: 2px 8px; font-size: 11px; }
.pill.st-neutral { background: var(--gray-50, #f4f6fa); border: 1px solid var(--gray-200, #e8edf4); color: var(--ink-2, #3c4655); }
.pill.st-role { background: var(--purple-50, #f3ecfe); border: 1px solid var(--purple-200, #d9c9fa); color: var(--purple-800, #5b21b6); }
.pill.st-awaiting_quote { background: var(--blue-50, #e9f1fe); border: 1px solid var(--blue-200, #c2dafe); color: var(--blue-800, #1e40af); }
.pill.st-pending_followup { background: var(--red-50, #fdecea); border: 1px solid var(--red-200, #f9c7c2); color: var(--red-800, #991b1b); }

/* ── 行程日 ── */
.day-card { border: 1px solid var(--line); border-radius: 10px; margin-bottom: 8px; overflow: hidden; }
.day-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; user-select: none; }
.day-row:hover { background: var(--surface-2, #fbfcfe); }
.day-badge { width: 32px; height: 32px; border-radius: 8px; background: var(--brand-50, #fdeef0); color: var(--brand); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; flex-shrink: 0; }
.day-summary { flex: 1; min-width: 0; }
.day-city { display: block; font-size: 14px; font-weight: 600; color: var(--ink); margin-bottom: 2px; }
.day-meta { display: flex; flex-wrap: wrap; gap: 6px; }
.day-tag { background: var(--bg, #f4f6fa); border-radius: 4px; padding: 1px 6px; font-size: 11px; color: var(--muted); }
.day-chev { font-size: 14px; color: var(--muted); transition: transform .2s; flex-shrink: 0; }
.day-chev.open { transform: rotate(180deg); color: var(--brand); }

/* 展开编辑区 */
.day-edit { border-top: 1px solid var(--line); padding: 12px; background: var(--surface-2, #fbfcfe); }
.day-field-row { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.day-field { display: flex; flex-direction: column; gap: 4px; }
.day-field label { font-size: 12px; color: var(--muted); font-weight: 500; }
.day-field input { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; }
.day-field.full { margin-bottom: 8px; }
.day-inline-row { display: flex; gap: 6px; margin-bottom: 6px; }
.day-inline-row input { flex: 1; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; }
.day-actions { margin-top: 8px; display: flex; justify-content: flex-end; }

/* ── 变更摘要 ── */
.changes-summary { background: var(--brand-50); border-color: var(--brand-100); }
.changes-summary h3 { color: var(--brand-600); }
.ch-block { display: flex; gap: 8px; margin: 6px 0; padding: 6px 0; border-bottom: 1px solid var(--brand-100); }
.ch-block:last-child { border-bottom: none; }
.ch-label { font-weight: 600; font-size: 13px; color: var(--ink-2); min-width: 48px; }
.ch-detail { font-size: 13px; color: var(--ink); }
.ch-up { color: var(--danger); margin-left: 4px; }
.ch-down { color: var(--ok); margin-left: 4px; }
.ch-city-list { display: block; margin-top: 4px; }
.ch-city-tag { display: inline-block; background: rgba(0,0,0,.04); border-radius: 4px; padding: 1px 6px; font-size: 11px; margin: 2px 4px 2px 0; }

/* ── 通用按钮 ── */
.btn { width: 100%; margin-top: 8px; padding: 10px; border: 1px solid var(--line-strong); background: var(--surface); border-radius: 10px; cursor: pointer; font-size: 14px; font-family: inherit; }
.btn-primary { background: var(--brand); color: #fff; border: none; padding: 12px; font-weight: 700; }
.btn-primary:disabled { opacity: 0.6; }
.btn.ghost { background: transparent; border: none; margin-top: 0; }
.btn.ghost.xs { padding: 2px 6px; font-size: 12px; width: auto; }
.btn.ghost.sm { padding: 4px 10px; font-size: 12px; width: auto; }
.btn.dash { background: var(--teal-50, #e6f7f0); color: var(--teal-600, #0f9d6f); border: 1px dashed var(--teal-200, #b8ead8); width: 100%; }

/* ── 输入框 ── */
textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box; resize: vertical; }
.err { color: var(--danger); margin-top: 8px; font-size: 13px; }
.ok { color: var(--ok); margin-top: 8px; font-size: 13px; }
.muted { color: var(--muted); font-size: 13px; }
.cost-total { margin: 8px 0; font-size: 14px; color: var(--muted); }
.submitted-tip { margin: 6px 0; font-size: 13px; color: var(--ok); }

/* ── 通知框 ── */
.notify-box { margin-top: 12px; border: 1px solid var(--brand); border-radius: 10px; padding: 10px 12px; background: rgba(59,130,246,.06); }
.notify-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--brand); }
.notify-head .btn { margin-left: auto; }
.notify-text { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6; color: var(--ink); font-family: inherit; }

/* ── 反馈列表 ── */
.fb-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.fb-item { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--surface); }
.fb-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--muted); }
.fb-meta b { color: var(--ink); }
.fb-time { margin-left: auto; white-space: nowrap; }
.fb-content { margin: 6px 0 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }

/* ============================================================
   PC 端 (≥768px) — 两栏 + 系统品牌色
   ============================================================ */
@media (min-width: 768px) {
  .prov-page { padding: 24px 32px; background: var(--bg, #f4f6fa); min-height: 100vh; }
  .prov-content { max-width: 1200px; margin: 0 auto; }
  .prov-title { font-size: 24px; }
  .prov-columns { display: flex; gap: 24px; align-items: flex-start; }
  .prov-left { width: 60%; min-width: 0; }
  .prov-right { width: 40%; min-width: 340px; }
  .prov-section { border-radius: 12px; padding: 16px; }
  .hint { font-size: 14px; }
  .day-card { border-radius: 12px; }
  .day-badge { width: 36px; height: 36px; border-radius: 9px; font-size: 13px; }
  .day-city { font-size: 15px; }
  .day-row { padding: 12px 16px; }
  .day-edit { padding: 14px 16px; }
  .day-field-row { flex-direction: row; gap: 12px; }
  .day-field { flex: 1; }
  .btn-primary { padding: 14px; font-size: 15px; }
  textarea { font-size: 14px; }
  .changes-summary { border-left: 3px solid var(--brand); }
}

/* ── PandaKing 回传确认视图 ── */
.pk-view .pk-chip { background: var(--brand-50, #fdeef0); border-color: var(--brand); color: var(--brand); font-weight: 600; }
.pk-view .hint { font-size: 14px; line-height: 1.6; margin: 0 0 16px; }

/* 成本只读表 */
.pk-cost-tbl { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.pk-cost-head, .pk-cost-row, .pk-cost-total { display: flex; justify-content: space-between; padding: 8px 12px; font-size: 14px; }
.pk-cost-head { background: var(--gray-50, #f4f6fa); font-weight: 600; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
.pk-cost-row { border-bottom: 1px solid var(--line-weak, #f0f0f0); }
.pk-cost-row:last-child { border-bottom: none; }
.pk-cost-total { background: var(--brand-50, #fdeef0); font-weight: 700; color: var(--brand); padding: 10px 12px; font-size: 15px; }
.pk-cost-amt { font-size: 17px; }

/* 利润设置 */
.pk-profit-section { background: var(--brand-50, #fdeef0); border-color: var(--brand-100, #f9c7c2); }
.pk-profit-section h3 { color: var(--brand-600, #b91c1c); }
.pk-profit-form { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
.pk-profit-mode { display: flex; gap: 16px; }
.pk-radio { display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 14px; color: var(--ink); }
.pk-radio input { cursor: pointer; }
.pk-profit-input { display: flex; align-items: center; gap: 6px; }
.pk-profit-input input { flex: 1; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; font-size: 16px; font-weight: 600; color: var(--brand); font-family: inherit; }
.pk-profit-unit { font-size: 16px; font-weight: 600; color: var(--brand); min-width: 24px; }
.pk-quote-preview { border-top: 1px solid var(--brand-100, #f9c7c2); padding-top: 10px; }
.pk-qp-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; color: var(--ink); }
.pk-qp-profit { color: var(--brand); }
.pk-qp-divider { border-top: 1px dashed var(--brand-200, #e5a5a0); margin: 6px 0; }
.pk-qp-total { font-weight: 700; font-size: 16px; }
.pk-quote-amt { font-size: 20px; color: var(--brand); }
.pk-gen-btn { margin-top: 0; padding: 14px; font-size: 16px; }

/* 跳转链接 */
.pk-nav-hint { margin-top: 16px; font-size: 13px; text-align: center; }
.pk-nav-hint a { color: var(--teal-600, #0f9d6f); text-decoration: none; }
.pk-nav-hint a:hover { text-decoration: underline; }

/* PandaKing 等待回传视图：醒目提示框 */
.pk-pending-tip {
  background: #fff8e1;
  border: 1px solid #ffe082;
  border-radius: 10px;
  padding: 14px 16px;
  color: #6b4f0a;
  font-size: 14px;
  line-height: 1.8;
  margin: 0 0 20px;
}
.pk-pending-tip b { color: var(--brand, #c8102e); }
</style>
