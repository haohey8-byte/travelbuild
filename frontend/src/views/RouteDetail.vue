<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import {
  fetchRoute,
  saveVersion,
  shareRoute,
  routeAction,
  fetchRouteFeedback,
  assignProvincial,
  createCostInquiry,
  listCostInquiries,
  applyCostInquiry,
  createProvincialShare,
} from '@/api/routes'
import { fetchAgencies } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { safeName, safeText } from '@/utils/name'
import {
  shareH5Url,
  shareH5Caption,
  collabNotifyText,
  roleLabel,
  copyText,
  costInquiryH5Url,
  provincialRouteH5Url,
} from '@/utils/share'
import type { Route, RouteStatusKey, QuoteLevel, RouteFeedbackItem, Agency } from '@/types'
import { buildPdfModel, type PdfModel } from '@/utils/pdf-model'
import { generatePdf } from '@/utils/pdf-export'
import { PDF_LANG_OPTIONS, PDF_VERSION_LABEL, type PdfLang, type PdfVersion } from '@/utils/pdf-i18n'
import RoutePdf from '@/components/RoutePdf.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { user } = storeToRefs(auth)
const id = route.params.id as string

const data = ref<Route | null>(null)
const loading = ref(true)
const err = ref('')
const tab = ref<'edit' | 'info' | 'flow'>('edit')
const actionErr = ref('')
const actionOk = ref('')
const savingDraft = ref(false)
const savingNotify = ref(false)
const doing = ref('')
const shareLink = ref('')

// —— PDF 多语言导出（PRD 5.8）——
const pdfPanelOpen = ref(false)
const pdfVersion = ref<PdfVersion>('internal')
const pdfLang = ref<PdfLang>('zh')
const pdfBusy = ref(false)
const pdfErr = ref('')
const pdfModel = ref<PdfModel | null>(null)
const pdfWrap = ref<HTMLElement | null>(null)

// 版本开放范围（权限矩阵 4.7 / 5.8）：一手=全部；旅行社=旅行社版+游客版；其余无
const pdfVersionOptions = computed<{ value: PdfVersion; label: string }[]>(() => {
  if (role.value === 'pandaking') {
    return [
      { value: 'internal', label: PDF_VERSION_LABEL.internal },
      { value: 'agency', label: PDF_VERSION_LABEL.agency },
      { value: 'tourist', label: PDF_VERSION_LABEL.tourist },
    ]
  }
  if (role.value === 'agency') {
    return [
      { value: 'agency', label: PDF_VERSION_LABEL.agency },
      { value: 'tourist', label: PDF_VERSION_LABEL.tourist },
    ]
  }
  return []
})
const canExportPdf = computed(() => pdfVersionOptions.value.length > 0)

async function onExportPdf() {
  if (!data.value) return
  pdfBusy.value = true
  pdfErr.value = ''
  try {
    const model = await buildPdfModel({
      route: {
        customerName: data.value.customerName,
        customerNameCn: data.value.customerNameCn,
        destination: data.value.destination,
        groupSize: data.value.groupSize,
        travelDate: data.value.travelDate ?? null,
        statusKey: data.value.statusKey,
        version: data.value.version,
      },
      itinerary: itinerary.value,
      quote: { items: quoteItems.value, totals: totals.value },
      version: pdfVersion.value,
      lang: pdfLang.value,
      statusLabel: STATUS_LABEL[data.value.statusKey],
      versionLabel: versionLabel.value,
    })
    pdfModel.value = model
    await nextTick()
    const safeName = (data.value.customerNameCn || data.value.customerName || 'route').replace(
      /[\\/:*?"<>|]/g,
      '_',
    )
    const filename = `${safeName}_${model.title}_${model.langName}.pdf`
    if (pdfWrap.value) await generatePdf(pdfWrap.value, filename)
    pdfPanelOpen.value = false
  } catch (e: any) {
    pdfErr.value = e?.message || '导出失败'
  } finally {
    pdfBusy.value = false
  }
}

// —— 反馈记录（H5 链接反馈 + 一手回传反馈，协作双方可见）——
const feedbackList = ref<RouteFeedbackItem[]>([])
async function loadFeedback() {
  try {
    feedbackList.value = await fetchRouteFeedback(id)
  } catch {
    feedbackList.value = []
  }
}

// —— 行程（按天）——
interface Day {
  day: number
  city: string
  spots: string[]
  hotel: string
  meals: string[]
}
const itinerary = ref<{ days: Day[] }>({ days: [newDay(1)] })
function newDay(n: number): Day {
  return { day: n, city: '', spots: [''], hotel: '', meals: [''] }
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

// —— 报价（5 级：包车/酒店/门票/餐饮/其他）——
const QUOTE_TYPES: { key: QuoteLevel['type']; label: string }[] = [
  { key: 'vehicle', label: '包车' },
  { key: 'hotel', label: '酒店' },
  { key: 'ticket', label: '门票' },
  { key: 'meal', label: '餐饮' },
  { key: 'other', label: '其他' },
]
const quoteItems = ref<QuoteLevel[]>([])
function newItem(): QuoteLevel {
  return { type: 'vehicle', cost1: 0, cost2: 0, markup: 0, guestPrice: 0 }
}
function addItem() {
  quoteItems.value.push(newItem())
}
function removeItem(i: number) {
  quoteItems.value.splice(i, 1)
}
function itemGuest(it: QuoteLevel): number {
  return (Number(it.cost1) || 0) + (Number(it.cost2) || 0) + (Number(it.markup) || 0)
}
const totals = computed(() => {
  return quoteItems.value.reduce(
    (acc, it) => {
      acc.cost1 += Number(it.cost1) || 0
      acc.cost2 += Number(it.cost2) || 0
      acc.markup += Number(it.markup) || 0
      acc.guestPrice += itemGuest(it)
      return acc
    },
    { cost1: 0, cost2: 0, markup: 0, guestPrice: 0 },
  )
})
// 当前角色可编辑/可见的成本字段
const role = computed(() => auth.currentRole)
const canEditCost = computed(() => role.value === 'pandaking')
// 旅行社可在报价基础上加价生成对游客报价（成本①/② 由一手填写，旅行社不可改）
const canEditMarkup = computed(() => role.value === 'pandaking' || role.value === 'agency')
const showCost1 = computed(() => role.value === 'pandaking' || role.value === 'provincial')
const showCost2 = computed(() => role.value === 'pandaking')

// —— 状态流转 ——
const STATUS_LABEL: Record<RouteStatusKey, string> = {
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
const ACTIONS_BY_STATUS: Record<RouteStatusKey, { key: string; label: string; needNote?: boolean }[]> = {
  consulting: [{ key: 'submit', label: '提交草案' }],
  awaiting_pk_confirm: [
    { key: 'confirm', label: '确认采用' },
    { key: 'feedback', label: '回传反馈', needNote: true },
  ],
  awaiting_agency_revision: [{ key: 'revise', label: '修订重交' }],
  awaiting_quote: [{ key: 'send-v1', label: '发报价 v1' }],
  awaiting_feedback: [{ key: 'markup', label: '加价' }],
  awaiting_confirm: [{ key: 'tourist-confirm', label: '游客确认' }],
  confirmed: [{ key: 'pay', label: '付款成单' }],
  booked: [],
  pending_followup: [],
  lost: [],
}
const availableActions = computed(() => {
  if (!data.value) return []
  const list = ACTIONS_BY_STATUS[data.value.statusKey] ?? []
  // 拒绝在任何非终态可用
  if (data.value.statusKey !== 'lost' && data.value.statusKey !== 'confirmed') {
    list.push({ key: 'reject', label: '拒绝/流失' })
  }
  return list
})
const feedbackNote = ref('')
// 回传反馈后自动生成的通知文案（带主题+建议+H5链接），便于粘贴到微信同步一手
const notifyTextConsole = ref('')

const versionLabel = computed(() => data.value?.versions?.[0]?.version ?? 'v1')

// —— 成本询价（一手） ——
const costInquiries = ref<{ id: string; routeId: string; provincialId: string; status: string; cost1: number | null; createdAt: string }[]>([])
const loadingInquiries = ref(false)
const assignProvId = ref('')
const inquiryProvId = ref('')
const inquiryLink = ref('')
const inquiryErr = ref('')
const copiedInquiry = ref(false)
const applyingId = ref('')

// 省地接社机构下拉选项（一手分配/询价用）
const provincialAgencies = ref<Agency[]>([])
const loadingProvincialAgencies = ref(false)
async function loadProvincialAgencies() {
  loadingProvincialAgencies.value = true
  try {
    const all = await fetchAgencies()
    provincialAgencies.value = all.filter((a) => a.role === 'provincial')
  } catch {
    provincialAgencies.value = []
  } finally {
    loadingProvincialAgencies.value = false
  }
}
async function loadInquiries() {
  if (role.value !== 'pandaking') return
  loadingInquiries.value = true
  try {
    costInquiries.value = await listCostInquiries(id)
  } catch {
    costInquiries.value = []
  } finally {
    loadingInquiries.value = false
  }
}
async function onAssignProvincial() {
  inquiryErr.value = ''
  if (!assignProvId.value.trim()) {
    inquiryErr.value = '请填写省地接社机构编号'
    return
  }
  try {
    await assignProvincial(id, assignProvId.value.trim())
    actionOk.value = `已将路线分配给省地接社 ${assignProvId.value.trim()}，该省地接社现可看到此路线并参与协作`
    await load()
  } catch (e: any) {
    inquiryErr.value = e?.response?.data?.message || '分配失败'
  }
}
async function onCreateInquiry() {
  inquiryErr.value = ''
  copiedInquiry.value = false
  if (!inquiryProvId.value.trim()) {
    inquiryErr.value = '请填写要询价的省地接社机构编号'
    return
  }
  try {
    const res = await createCostInquiry(id, inquiryProvId.value.trim())
    inquiryLink.value = costInquiryH5Url(res.token)
    await loadInquiries()
  } catch (e: any) {
    inquiryErr.value = e?.response?.data?.message || '发起询价失败'
  }
}
async function copyInquiryLink() {
  if (!inquiryLink.value) return
  const ok = await copyText(inquiryLink.value)
  copiedInquiry.value = ok
  setTimeout(() => (copiedInquiry.value = false), 2000)
}
async function onApplyInquiry(inqId: string) {
  applyingId.value = inqId
  inquiryErr.value = ''
  try {
    await applyCostInquiry(inqId)
    actionOk.value = '已将省地接社成本①写入路线报价（成本①）'
    await load()
    await loadInquiries()
  } catch (e: any) {
    inquiryErr.value = e?.response?.data?.message || '应用失败'
  } finally {
    applyingId.value = ''
  }
}

// 一手生成「省地接社协作 H5」（可编辑行程），复制发微信群
const provShareLink = ref('')
const copiedProvShare = ref(false)
const provShareErr = ref('')
async function onGenProvShare() {
  provShareErr.value = ''
  copiedProvShare.value = false
  try {
    const res = await createProvincialShare(id)
    provShareLink.value = provincialRouteH5Url(res.token)
  } catch (e: any) {
    provShareErr.value = e?.response?.data?.message || '生成协作 H5 失败（请先分配省地接社）'
  }
}
async function copyProvShare() {
  if (!provShareLink.value) return
  const ok = await copyText(provShareLink.value)
  copiedProvShare.value = ok
  setTimeout(() => (copiedProvShare.value = false), 2000)
}

function displayName(r: Route): string {
  return safeName(r.customerNameCn, r.customerName)
}

onMounted(load)
async function load() {
  loading.value = true
  err.value = ''
  try {
    await loadProvincialAgencies()
    const r = await fetchRoute(id)
    data.value = r
    const v = r.versions?.[0]
    if (v?.itinerary && typeof v.itinerary === 'object') {
      const it = v.itinerary as { days?: Day[] }
      itinerary.value = { days: it.days?.length ? it.days : [newDay(1)] }
    } else {
      itinerary.value = { days: [newDay(1)] }
    }
    if (v?.quote && typeof v.quote === 'object') {
      const q = v.quote as { items?: QuoteLevel[] }
      quoteItems.value = (q.items ?? []).map((it) => ({ ...it }))
    } else {
      quoteItems.value = []
    }
    await loadFeedback()
    await loadInquiries()
  } catch (e: any) {
    err.value = e?.response?.data?.message || '加载失败'
  } finally {
    loading.value = false
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

function buildQuote() {
  return {
    items: quoteItems.value.map((it) => ({
      type: it.type,
      cost1: Number(it.cost1) || 0,
      cost2: Number(it.cost2) || 0,
      markup: Number(it.markup) || 0,
      guestPrice: itemGuest(it),
    })),
    totals: {
      cost1: totals.value.cost1,
      cost2: totals.value.cost2,
      markup: totals.value.markup,
      guestPrice: totals.value.guestPrice,
    },
  }
}

async function onSaveDraft() {
  savingDraft.value = true
  actionErr.value = ''
  try {
    await saveVersion(id, {
      itinerary: itinerary.value,
      quote: buildQuote(),
      draft: true,
      notify: false,
    })
    await load()
  } catch (e: any) {
    actionErr.value = e?.response?.data?.message || '保存失败'
  } finally {
    savingDraft.value = false
  }
}

async function onSaveNotify() {
  savingNotify.value = true
  actionErr.value = ''
  actionOk.value = ''
  try {
    const res = (await saveVersion(id, {
      itinerary: itinerary.value,
      quote: buildQuote(),
      draft: false,
      notify: true,
    })) as { shareToken?: string; shareLink?: string; version?: any }
    // 后端返回 /share/route/TOKEN 或 shareToken；分享页由后端 SSR 注入 OG
    const token = res.shareToken || res.shareLink?.split('/').pop() || ''
    const link = token ? shareH5Url(token) : ''
    shareLink.value = link
    if (link && data.value) {
      const caption = shareH5Caption(data.value)
      const text = `${caption}\n${link}`
      try {
        await navigator.clipboard.writeText(text)
        actionOk.value = '协作 H5 链接已生成并复制到剪贴板，可粘贴到微信'
      } catch {
        actionOk.value = '协作 H5 链接已生成，请手动复制下方链接'
      }
    } else {
      actionOk.value = '已保存新版本，但未生成分享链接'
    }
    await load()
    await loadFeedback()
  } catch (e: any) {
    actionErr.value = e?.response?.data?.message || '保存并通知失败'
  } finally {
    savingNotify.value = false
  }
}

async function onAction(a: { key: string; label: string; needNote?: boolean }) {
  if (a.needNote && !feedbackNote.value.trim()) {
    actionErr.value = '请填写反馈内容'
    return
  }
  doing.value = a.key
  actionErr.value = ''
  try {
    const note = feedbackNote.value
    const body = a.needNote ? { feedback: note } : undefined
    await routeAction(id, a.key, body)
    feedbackNote.value = ''
    // 除「拒绝/流失」外，所有状态流转（规划提交类动作）与反馈意见，
    // 都生成「主题 + 事件 + H5 链接」通知文案并复制到剪贴板，便于粘贴到微信群同步协作方。
    if (a.key !== 'reject' && data.value) {
      let link = shareLink.value
      if (!link) {
        try {
          const s = await shareRoute(id)
          link = s.token ? shareH5Url(s.token) : s.link || ''
          shareLink.value = link
        } catch {
          link = ''
        }
      }
      if (link) {
        const isFeedback = !!a.needNote
        const text = collabNotifyText({
          kind: isFeedback ? 'feedback' : 'plan',
          eventLabel: a.label,
          subject: safeName(data.value.customerNameCn, data.value.customerName),
          destination: safeText(data.value.destination),
          authorName: user.value?.name || roleLabel(role.value),
          detail: isFeedback ? note : undefined,
          url: link,
        })
        notifyTextConsole.value = text
        const ok = await copyText(text)
        actionOk.value = ok
          ? '通知文案已复制到剪贴板，去微信粘贴到协作群即可同步 ✅'
          : '通知文案已生成，请手动复制下方文案发到协作群'
      } else {
        actionOk.value = `${a.label}成功`
      }
    } else {
      actionOk.value = `${a.label}成功`
    }
    await load()
    await loadFeedback()
  } catch (e: any) {
    actionErr.value = e?.response?.data?.message || `${a.label}失败（可能状态不允许）`
  } finally {
    doing.value = ''
  }
}
async function copyShareLink() {
  if (!shareLink.value || !data.value) return
  const text = `${shareH5Caption(data.value)}\n${shareLink.value}`
  const ok = await copyText(text)
  actionOk.value = ok ? '协作 H5 链接已复制，去微信群粘贴即可 ✅' : '复制失败，请手动复制下方链接'
}
async function copyConsoleNotify() {
  if (!notifyTextConsole.value) return
  const ok = await copyText(notifyTextConsole.value)
  actionOk.value = ok ? '已再次复制，去微信粘贴到协作群 ✅' : '复制失败，请手动选择上方文字复制'
}
</script>

<template>
  <div>
    <p v-if="loading">加载中…</p>
    <p v-else-if="err" class="err">{{ err }}</p>

    <template v-else-if="data">
      <div class="head">
        <button class="btn ghost" @click="router.push('/routes/kanban')">← 返回</button>
        <h1 class="page-title">
          {{ displayName(data) }}
          <span class="sub">{{ safeText(data.destination) || '未填目的地' }} · {{ STATUS_LABEL[data.statusKey] }} · {{ versionLabel }}</span>
        </h1>
      </div>

      <div class="actions">
        <button class="btn btn-primary" :disabled="savingDraft || savingNotify" @click="onSaveDraft">
          {{ savingDraft ? '保存中…' : '保存草稿' }}
        </button>
        <button class="btn" :disabled="savingDraft || savingNotify" @click="onSaveNotify">
          {{ savingNotify ? '生成中…' : '保存并通知（生成协作 H5）' }}
        </button>
        <a v-if="shareLink" :href="shareLink" target="_blank" class="link">打开协作 H5 ↗</a>
        <button v-if="shareLink" class="btn ghost sm" @click="copyShareLink">复制链接</button>
        <button v-if="canExportPdf" class="btn" @click="pdfPanelOpen = !pdfPanelOpen">📄 导出PDF</button>
      </div>

      <div v-if="canExportPdf && pdfPanelOpen" class="pdf-panel">
        <div class="pdf-panel-row">
          <span class="pdf-panel-label">版本</span>
          <label v-for="o in pdfVersionOptions" :key="o.value" class="pdf-opt">
            <input type="radio" :value="o.value" v-model="pdfVersion" /> {{ o.label }}
          </label>
        </div>
        <div class="pdf-panel-row">
          <span class="pdf-panel-label">语言</span>
          <label v-for="o in PDF_LANG_OPTIONS" :key="o.value" class="pdf-opt">
            <input type="radio" :value="o.value" v-model="pdfLang" /> {{ o.label }}
          </label>
        </div>
        <div class="pdf-panel-actions">
          <button class="btn btn-primary" :disabled="pdfBusy" @click="onExportPdf">
            {{ pdfBusy ? '生成中…' : '生成并下载 PDF' }}
          </button>
          <button class="btn ghost" @click="pdfPanelOpen = false">取消</button>
        </div>
        <p v-if="pdfErr" class="err">{{ pdfErr }}</p>
      </div>
      <p v-if="actionErr" class="err">{{ actionErr }}</p>
      <p v-if="actionOk" class="ok">{{ actionOk }}</p>

      <!-- 离屏 PDF 渲染容器（导出时填充，不直接显示） -->
      <div ref="pdfWrap" class="pdf-offscreen" aria-hidden="true">
        <RoutePdf v-if="pdfModel" :model="pdfModel" />
      </div>
      <div v-if="notifyTextConsole" class="fb-notify">
        <div class="fb-notify-head">
          <span>📋 通知文案（去微信粘贴到协作群）</span>
          <button class="btn ghost sm" @click="copyConsoleNotify">再复制</button>
        </div>
        <pre class="fb-notify-text">{{ notifyTextConsole }}</pre>
      </div>

      <div class="tab-bar">
        <button :class="['tab', { active: tab === 'edit' }]" @click="tab = 'edit'">行程与报价</button>
        <button :class="['tab', { active: tab === 'info' }]" @click="tab = 'info'">客户与版本</button>
        <button :class="['tab', { active: tab === 'flow' }]" @click="tab = 'flow'">状态流转</button>
      </div>

      <!-- 行程与报价 -->
      <div v-if="tab === 'edit'" class="grid-2">
        <section class="card">
          <h3>行程安排（按天）</h3>
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

        <section class="card">
          <h3>报价（5 级成本分离）</h3>
          <p v-if="!canEditCost" class="hint">
            当前角色（{{ role }}）按权限仅可见部分成本字段；完整编辑请切换为一手 PandaKing。
          </p>
          <p v-if="role === 'provincial'" class="hint">
            省地接社可见自身成本①（只读）。地接成本由一手发起的「成本询价 H5」回填；左侧行程规划可直接编辑保存，参与协作。
          </p>
          <div class="tbl-wrap">
          <table class="quote">
            <thead>
              <tr>
                <th>项目</th>
                <th v-if="showCost1">成本①</th>
                <th v-if="showCost2">成本②(利润)</th>
                <th>加价④</th>
                <th>对客价⑤</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(it, i) in quoteItems" :key="i">
                <td>
                  <select v-model="it.type">
                    <option v-for="t in QUOTE_TYPES" :key="t.key" :value="t.key">{{ t.label }}</option>
                  </select>
                </td>
                <td v-if="showCost1">
                  <input type="number" v-model.number="it.cost1" :disabled="!canEditCost" />
                </td>
                <td v-if="showCost2">
                  <input type="number" v-model.number="it.cost2" :disabled="!canEditCost" />
                </td>
                <td><input type="number" v-model.number="it.markup" :disabled="!canEditMarkup" /></td>
                <td class="ro">¥{{ itemGuest(it).toLocaleString() }}</td>
                <td><button class="btn ghost sm" @click="removeItem(i)">×</button></td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>合计</td>
                <td v-if="showCost1" class="ro">¥{{ totals.cost1.toLocaleString() }}</td>
                <td v-if="showCost2" class="ro">¥{{ totals.cost2.toLocaleString() }}</td>
                <td class="ro">¥{{ totals.markup.toLocaleString() }}</td>
                <td class="ro total">¥{{ totals.guestPrice.toLocaleString() }}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
          </div>
          <button class="btn" @click="addItem">+ 添加报价项</button>
        </section>
      </div>

      <!-- 客户与版本 -->
      <div v-else-if="tab === 'info'" class="card">
        <h3>客户档案</h3>
        <div class="kv">
          <div><span>客户</span><b>{{ displayName(data) }}</b></div>
          <div><span>国家</span><b>{{ data.country }}</b></div>
          <div><span>旅行社</span><b>{{ safeText(data.agency) || '-' }}</b></div>
          <div><span>人数</span><b>{{ data.groupSize }}</b></div>
          <div><span>出行日期</span><b>{{ data.travelDate ? new Date(data.travelDate).toLocaleDateString() : '-' }}</b></div>
          <div><span>模式</span><b>{{ data.modeKey === 'collab' ? '协作' : '自营' }}</b></div>
        </div>
        <h3 style="margin-top: 20px">版本历史</h3>
        <div class="tbl-wrap">
        <table class="ver">
          <thead><tr><th>版本</th><th>草稿</th><th>创建时间</th></tr></thead>
          <tbody>
            <tr v-for="v in data.versions" :key="v.id">
              <td>{{ v.version }}</td>
              <td>{{ v.draft ? '草稿' : '正式' }}</td>
              <td>{{ new Date(v.createdAt).toLocaleString() }}</td>
            </tr>
            <tr v-if="!data.versions?.length"><td colspan="3">暂无版本</td></tr>
          </tbody>
        </table>
        </div>
      </div>

      <!-- 状态流转 -->
      <div v-else class="card">
        <h3>当前状态：{{ STATUS_LABEL[data.statusKey] }}</h3>
        <p class="hint">状态流转由后端状态机强制校验，非法操作会被拒绝。</p>
        <div class="flow-actions">
          <button
            v-for="a in availableActions"
            :key="a.key"
            class="btn"
            :class="{ danger: a.key === 'reject' }"
            :disabled="!!doing"
            @click="onAction(a)"
          >
            {{ doing === a.key ? '处理中…' : a.label }}
          </button>
        </div>
        <div v-if="availableActions.find((a) => a.needNote)" class="f-block" style="margin-top: 12px">
          <span class="lbl">反馈内容（回传修改意见）</span>
          <textarea v-model="feedbackNote" rows="3" placeholder="填写要回传给对方/旅行社的修改意见"></textarea>
        </div>
      </div>

      <!-- 反馈记录（H5 链接反馈 + 一手回传反馈，协作双方均可见） -->
      <section class="card fb-card">
        <h3>
          反馈记录
          <span v-if="feedbackList.length" class="fb-count">{{ feedbackList.length }}</span>
        </h3>
        <ul v-if="feedbackList.length" class="fb-list">
          <li v-for="fb in feedbackList" :key="fb.id" class="fb-item">
            <div class="fb-meta">
              <b>{{ fb.authorName || (fb.source === 'h5' ? '协作方' : '一手地接社') }}</b>
              <span class="fb-tag" :class="fb.source">{{ fb.source === 'h5' ? 'H5 链接反馈' : '回传反馈' }}</span>
              <span class="fb-time">{{ fmtTime(fb.createdAt) }}</span>
            </div>
            <p class="fb-content">{{ fb.content }}</p>
          </li>
        </ul>
        <p v-else class="muted">暂无反馈意见。对方可在协作 H5 链接内提交修改意见，或在此回传反馈。</p>
      </section>

      <!-- 成本询价（仅一手）：分配省地接社 + 发起询价 + 应用 -->
      <section class="card fb-card" v-if="role === 'pandaking'">
        <h3>成本询价（省地接社协作）</h3>
        <p class="hint">
          一手将路线分配给省地接社后，该省地接社可见此路线并参与行程规划；发起成本询价让其填写地接成本①，应用后写入路线报价。
        </p>
        <div class="ci-row">
          <select v-model="assignProvId" class="input sm" :disabled="loadingProvincialAgencies">
            <option value="" disabled>{{ loadingProvincialAgencies ? '加载中…' : '请选择省地接社机构' }}</option>
            <option v-for="a in provincialAgencies" :key="a.id" :value="a.id">{{ a.name }}（{{ a.id }}）</option>
          </select>
          <button class="btn sm" :disabled="!assignProvId" @click="onAssignProvincial">分配省地接社</button>
        </div>
        <div class="ci-row" style="margin-top: 10px">
          <select v-model="inquiryProvId" class="input sm" :disabled="loadingProvincialAgencies">
            <option value="" disabled>{{ loadingProvincialAgencies ? '加载中…' : '请选择询价省地接社机构' }}</option>
            <option v-for="a in provincialAgencies" :key="a.id" :value="a.id">{{ a.name }}（{{ a.id }}）</option>
          </select>
          <button class="btn sm" :disabled="!inquiryProvId" @click="onCreateInquiry">发起成本询价</button>
        </div>
        <p v-if="inquiryErr" class="err">{{ inquiryErr }}</p>
        <div v-if="inquiryLink" class="link-box">
          <input :value="inquiryLink" class="input" readonly />
          <button class="btn ghost sm" @click="copyInquiryLink">{{ copiedInquiry ? '已复制 ✓' : '复制链接' }}</button>
        </div>
        <p v-if="inquiryLink" class="tip">把链接发到微信群，省地接社打开即填成本①。</p>

        <div class="ci-row" style="margin-top: 12px">
          <button class="btn sm" :disabled="!data?.provincialId" @click="onGenProvShare">
            生成省地接社协作 H5（可编辑行程）
          </button>
        </div>
        <p v-if="provShareErr" class="err">{{ provShareErr }}</p>
        <div v-if="provShareLink" class="link-box">
          <input :value="provShareLink" class="input" readonly />
          <button class="btn ghost sm" @click="copyProvShare">{{ copiedProvShare ? '已复制 ✓' : '复制链接' }}</button>
        </div>
        <p v-if="provShareLink" class="tip">把链接发到微信群，省地接社打开即可编辑分配给自己的行程并提交规划建议。</p>

        <h3 style="margin-top: 18px">询价记录</h3>
        <p v-if="loadingInquiries">加载中…</p>
        <div v-else class="tbl-wrap">
          <table class="tbl">
            <thead><tr><th>省地接社</th><th>状态</th><th>成本①</th><th>操作</th></tr></thead>
            <tbody>
              <tr v-for="ci in costInquiries" :key="ci.id">
                <td>{{ provincialAgencies.find((a) => a.id === ci.provincialId)?.name || ci.provincialId }}</td>
                <td>{{ ci.status === 'submitted' ? '已回传' : '待回传' }}</td>
                <td>{{ ci.cost1 != null ? '¥' + Number(ci.cost1).toLocaleString() : '-' }}</td>
                <td>
                  <button
                    v-if="ci.status === 'submitted'"
                    class="btn ghost sm"
                    :disabled="!!applyingId"
                    @click="onApplyInquiry(ci.id)"
                  >
                    {{ applyingId === ci.id ? '应用中…' : '应用成本①' }}
                  </button>
                  <span v-else class="muted">待回传</span>
                </td>
              </tr>
              <tr v-if="!costInquiries.length"><td colspan="4" class="muted">暂无询价</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.sub { font-size: 14px; color: var(--muted); margin-left: 10px; font-weight: 400; }
.actions { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.link { color: var(--info); text-decoration: none; font-size: 14px; }
.err { color: var(--danger); }
.ok { color: var(--success, #10b981); }
.fb-notify { margin-top: 10px; border: 1px solid var(--brand); border-radius: 10px; padding: 10px 12px; background: rgba(59,130,246,.06); }
.fb-notify-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--brand); }
.fb-notify-head .btn { margin-left: auto; }
.fb-notify-text { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6; color: var(--ink); font-family: inherit; }
.tab-bar { display: flex; gap: 8px; margin-bottom: 12px; }
.tab { padding: 8px 16px; border: 1px solid var(--line); background: var(--card); border-radius: 8px; cursor: pointer; }
.tab.active { color: var(--brand); border-color: var(--brand); }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.day { border: 1px solid var(--line); border-radius: 10px; padding: 12px; margin-bottom: 12px; }
.day-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.f { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; font-size: 13px; color: var(--muted); }
.f input { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; }
.f-block { margin: 10px 0; }
.lbl { font-size: 13px; color: var(--muted); display: block; margin-bottom: 4px; }
.inline { display: flex; gap: 6px; margin-bottom: 6px; }
.inline input { flex: 1; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; }
.quote { width: 100%; border-collapse: collapse; }
.quote th, .quote td { padding: 8px; border-bottom: 1px solid var(--line); text-align: left; }
.quote input, .quote select { width: 100%; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; font-size: 13px; }
.quote .ro { font-weight: 600; }
.quote .total { color: var(--brand); font-size: 15px; }
.hint { color: var(--muted); font-size: 13px; }
.kv { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
.kv div { display: flex; gap: 8px; }
.kv span { color: var(--muted); width: 72px; }
.ver { width: 100%; border-collapse: collapse; }
.ver th, .ver td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; }
.flow-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.btn.ghost { background: transparent; }
.btn.ghost.sm { padding: 2px 8px; font-size: 12px; }
.btn.danger { border-color: var(--danger); color: var(--danger); }
textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box; }
.input { flex: 1; padding: 8px 10px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--surface); font-size: 14px; box-sizing: border-box; }
.input.sm { flex: 1; }
.btn.sm { padding: 8px 12px; font-size: 13px; border: 1px solid var(--line-strong); background: var(--surface); border-radius: 8px; cursor: pointer; }
.btn.sm:disabled { opacity: 0.6; }
.ci-row { display: flex; gap: 8px; align-items: center; }
.link-box { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
.link-box .input { font-size: 12px; color: var(--muted); }

/* 反馈记录 */
.fb-card { margin-top: 16px; }
.fb-count { display: inline-block; min-width: 20px; text-align: center; margin-left: 8px; padding: 1px 8px; font-size: 12px; background: var(--brand); color: #fff; border-radius: 999px; }
.fb-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.fb-item { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--card); }
.fb-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--muted); }
.fb-meta b { color: var(--ink); }
.fb-tag { padding: 1px 8px; border-radius: 999px; font-size: 12px; }
.fb-tag.h5 { background: rgba(59,130,246,.12); color: #3b82f6; }
.fb-tag.console { background: rgba(16,185,129,.12); color: #10b981; }
.fb-time { margin-left: auto; }
.fb-content { margin: 6px 0 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.muted { color: var(--muted); font-size: 13px; }

/* PDF 多语言导出面板 */
.pdf-panel {
  border: 1px solid var(--brand, #3b82f6);
  border-radius: 10px;
  padding: 12px 14px;
  margin: 10px 0;
  background: rgba(59, 130, 246, 0.05);
}
.pdf-panel-row { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-bottom: 8px; }
.pdf-panel-label { font-weight: 600; color: var(--muted); min-width: 40px; }
.pdf-opt { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; cursor: pointer; }
.pdf-panel-actions { display: flex; gap: 10px; margin-top: 4px; }
/* 离屏渲染容器：保留布局尺寸供 html2canvas 截图，但移出可视区 */
.pdf-offscreen {
  position: fixed;
  left: -10000px;
  top: 0;
  width: 794px;
  background: #fff;
  z-index: -1;
}

/* 响应式：窄屏单列、表横滑、tab 横滑 */
@media (max-width: 900px) {
  .grid-2 { grid-template-columns: 1fr; }
  .head { align-items: flex-start; }
  .sub { display: block; margin-left: 0; margin-top: 6px; }
}
@media (max-width: 560px) {
  .tab-bar { overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
  .tab { flex: 0 0 auto; }
  .quote { min-width: 560px; }
  .ver { min-width: 420px; }
  .actions .btn { flex: 1 1 auto; }
}
</style>
