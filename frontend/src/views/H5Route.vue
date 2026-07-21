<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  fetchH5Route,
  submitH5Feedback,
  fetchH5Feedback,
  submitH5PandakingEdit,
  submitH5AgencyEdit,
} from '@/api/h5'
import { safeText, safeName } from '@/utils/name'
import {
  shareH5Url,
  shareH5Caption,
  collabNotifyText,
  copyText,
  pandakingH5Url,
  agencyH5Url,
  roleLabel,
  diffQuoteChanges,
  formatQuoteChanges,
} from '@/utils/share'
import type { ProvincialChanges } from '@/utils/share'
import type { H5Route, RouteFeedbackItem, QuoteLevel } from '@/types'
import { buildPdfModel, type PdfModel } from '@/utils/pdf-model'
import { generatePdf } from '@/utils/pdf-export'
import { PDF_LANG_OPTIONS, t, type PdfLang } from '@/utils/pdf-i18n'
import { translateText, translateEnabled } from '@/utils/pdf-translate'
import { calcDerived, calcGuestPrice } from '@/utils/quote'
import QuoteTable from '@/components/QuoteTable.vue'
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

// —— 角色分支 ——
// public=true → 对客只读链接（客户看板）；否则按 role 区分 PandaKing(全编辑) / agency(行程+利润②)
const isPkView = computed(() => data.value?.role === 'pandaking' && !data.value?.public)
const isAgencyView = computed(() => data.value?.role === 'agency' && !data.value?.public)
const isPublicView = computed(() => !!data.value?.public)
const canEditItinerary = computed(() => isPkView.value || isAgencyView.value)
const roleBadgeClass = computed(() => (isPkView.value ? 'rb-pk' : isAgencyView.value ? 'rb-ag' : 'rb-pub'))
const roleBadgeText = computed(() => {
  if (isPkView.value) return '👑 PandaKing · 可编辑行程与价格'
  if (isAgencyView.value) return '🧳 境外旅行社 · 可编辑行程与加价'
  return '👀 客户预览 · 只读'
})
const ownerName = computed(() => (data.value && data.value.ownerName) || 'PandaKing')

// —— 行程（按天，可编辑：PandaKing / agency；只读：public）——
interface Day {
  day: number
  city: string
  spots: string[]
  hotel: string
  meals: string[]
}
const itinerary = ref<{ days: Day[] }>({ days: [] })
const openDays = ref(new Set<number>())
function toggleDay(di: number) {
  const s = new Set(openDays.value)
  if (s.has(di)) s.delete(di)
  else s.add(di)
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
  const s = new Set(openDays.value)
  s.add(di)
  openDays.value = s
}
function removeDay(i: number) {
  itinerary.value.days.splice(i, 1)
  itinerary.value.days.forEach((d, idx) => (d.day = idx + 1))
  const s = new Set(openDays.value)
  s.delete(i)
  const adjusted = new Set<number>()
  for (const idx of s) adjusted.add(idx > i ? idx - 1 : idx)
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

// —— PandaKing 视角：全量价格编辑（成本① + 利润① + 利润②）——
const quoteItems = ref<QuoteLevel[]>([])
const pkProfit2Mode = ref<'amount' | 'percent'>('amount')
const pkProfit2 = ref(0)
const pkDerived = computed(() => calcDerived(quoteItems.value))
const pkGuestPrice = computed(() => calcGuestPrice(pkDerived.value.quoteA, pkProfit2Mode.value, pkProfit2.value))
const pkSaving = ref(false)
const pkSaveOk = ref('')
const pkSaveErr = ref('')
const pkPeerTip = ref('')

// —— 旅行社视角：利润②（成本①不可见，仅见报价A 作为成本基线）——
const agProfit2Mode = ref<'amount' | 'percent'>('amount')
const agProfit2 = ref(0)
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
const agPeerTip = ref('')
// 旅行社「补充说明（可选）」+ 变更基线快照（用于计算本轮关键变更摘要）
const agFbText = ref('')
const agNotifyText = ref('')
const agNotifyTip = ref('')
const initialAgProfit2Mode = ref<'amount' | 'percent'>('amount')
const initialAgProfit2 = ref(0)
const initialAgItinerary = ref<{ days: { day: number; city: string }[] }>({ days: [] })
const agChanges = computed<ProvincialChanges>(() => {
  if (!isAgencyView.value) return {}
  return diffQuoteChanges({
    before: { profit2: initialAgProfit2.value, profit2Mode: initialAgProfit2Mode.value, itinerary: initialAgItinerary.value },
    after: {
      profit2: Number(agProfit2.value) || 0,
      profit2Mode: agProfit2Mode.value,
      itinerary: { days: itinerary.value.days.map((d) => ({ day: d.day, city: d.city })) },
    },
    editableFields: ['profit2', 'itinerary'],
    versionLabel: data.value?.version,
  })
})
const agHasChange = computed(() => {
  const ch = agChanges.value
  return !!ch.totals?.profit2 || (!!ch.itinerary && ch.itinerary.cityChanges.length > 0)
})

// —— 旅行社 AI 翻译：行程+对客总价 → 泰语版文字（供旅行社复制粘贴发客户） ——
const agThBusy = ref(false)
const agThText = ref('')
const agThErr = ref('')
const hasTranslate = translateEnabled()

// —— 导出游客版 PDF（PRD 5.8：旅行社/PandaKing 在 H5 内导出游客版）——
const pdfPanelOpen = ref(false)
const pdfLang = ref<PdfLang>('zh')
const pdfBusy = ref(false)
const pdfErr = ref('')
const pdfModel = ref<PdfModel | null>(null)
const pdfWrap = ref<HTMLElement | null>(null)

// —— 角色切换后把当前协作链接转发给对端（复制「说明 + 可编辑链接」）——
async function copyPeerLink() {
  if (!data.value) return
  const caption = shareH5Caption(data.value)
  let link = ''
  if (isPkView.value) {
    link = data.value.agencyToken ? agencyH5Url(data.value.agencyToken) : ''
    if (!link) {
      pkPeerTip.value = '暂无可发送的对旅行社链接'
      return
    }
    const ok = await copyText(`${caption}\n\n👉 查看并编辑行程报价（对旅行社）：${link}`)
    pkPeerTip.value = ok ? '对旅行社链接已复制，去微信粘贴 ✅' : '复制失败，请长按上方文案手动复制'
  } else if (isAgencyView.value) {
    link = data.value.pandakingToken ? pandakingH5Url(data.value.pandakingToken) : ''
    if (!link) {
      agPeerTip.value = '暂无可发送的 ' + ownerName.value + ' 链接'
      return
    }
    const ok = await copyText(`${caption}\n\n👉 查看并编辑行程报价（${ownerName.value}）：${link}`)
    agPeerTip.value = ok ? '对 ' + ownerName.value + ' 链接已复制，去微信粘贴 ✅' : '复制失败，请长按上方文案手动复制'
  }
}

async function copyShareLink() {
  if (!data.value) return
  const caption = shareH5Caption(data.value)
  const ok = await copyText(`${caption}\n${shareH5Url(token)}`)
  shareTip.value = ok ? '协作链接已复制，去微信粘贴到群里即可 ✅' : '复制失败，请长按上方链接手动复制'
}

// PandaKing 全量保存：行程 + 价格 → 生成新版本 → 同步对端令牌
async function onPkSave() {
  pkSaving.value = true
  pkSaveOk.value = ''
  pkSaveErr.value = ''
  pkPeerTip.value = ''
  try {
    if (!data.value) throw new Error('数据未加载')
    const payload = {
      itinerary: itinerary.value,
      quote: {
        items: quoteItems.value.map((it) => ({
          name: String(it.name || '').trim() || '未命名',
          type: it.type || 'other',
          cost1: Math.max(0, Number(it.cost1) || 0),
          profit1Mode: (it.profit1Mode as 'amount' | 'percent') || 'amount',
          profit1: Number(it.profit1) || 0,
        })),
        totals: { profit2Mode: pkProfit2Mode.value, profit2: Number(pkProfit2.value) || 0 },
      },
    }
    const res = await submitH5PandakingEdit(token, payload)
    // 用后端权威数据回显
    if (data.value && res.version) {
      data.value.version = (res.version as { version: string }).version ?? data.value.version
      if ((res.version as { itinerary?: unknown }).itinerary) data.value.itinerary = (res.version as { itinerary: Record<string, unknown> }).itinerary
      parseItinerary(data.value.itinerary)
    }
    if (res.quote) data.value.quote = res.quote as H5Route['quote']
    if (res.quote?.totals?.guestPrice != null) data.value.guestPrice = res.quote.totals.guestPrice
    if (res.agencyToken) data.value.agencyToken = res.agencyToken
    const gp = res.quote?.totals?.guestPrice ?? pkGuestPrice.value
    pkSaveOk.value = `已保存行程与报价（对客总价 ¥${Number(gp).toLocaleString()}）✅ 可把下方链接发给旅行社继续协作`
  } catch (e: any) {
    pkSaveErr.value = e?.response?.data?.message || e.message || '保存失败'
  } finally {
    pkSaving.value = false
  }
}

// 旅行社保存：行程 + 利润② → 生成新版本 → 同步对端令牌
async function onAgSave() {
  agSaving.value = true
  agSaveOk.value = ''
  agSaveErr.value = ''
  agPeerTip.value = ''
  agThText.value = ''
  agThErr.value = ''
  try {
    if (!data.value) throw new Error('数据未加载')
    const res = await submitH5AgencyEdit(token, {
      itinerary: itinerary.value,
      profit2Mode: agProfit2Mode.value,
      profit2: Number(agProfit2.value) || 0,
    })
    if (data.value && res.version) {
      data.value.version = (res.version as { version: string }).version ?? data.value.version
      if ((res.version as { itinerary?: unknown }).itinerary) data.value.itinerary = (res.version as { itinerary: Record<string, unknown> }).itinerary
      parseItinerary(data.value.itinerary)
    }
    if (res.quote) data.value.quote = res.quote as H5Route['quote']
    if (res.pandakingToken) data.value.pandakingToken = res.pandakingToken
    if (res.guestPrice != null) data.value.guestPrice = res.guestPrice
    const gp = res.guestPrice ?? agGuestPrice.value

    // 计算本轮关键变更摘要，合并为修改记录（写入历史修改记录），并生成微信文案发给 PandaKing
    const changes = agChanges.value
    const manual = agFbText.value.trim()
    const autoNote = formatQuoteChanges(changes)
    const combinedNote = manual
      ? (agHasChange.value ? `${autoNote}\n\n【补充说明】${manual}` : manual)
      : (agHasChange.value ? autoNote : '')
    if (combinedNote) {
      try {
        await submitH5Feedback(token, combinedNote, authorName.value.trim() || undefined, 'agency')
      } catch {
        /* 变更记录失败不阻断保存 */
      }
    }
    if (data.value) {
      const url = data.value.pandakingToken ? pandakingH5Url(data.value.pandakingToken) : shareH5Url(token)
      const text = collabNotifyText({
        kind: 'plan',
        eventLabel: '更新行程与报价并回传',
        subject: safeName(data.value.customerNameCn, data.value.customerName),
        destination: data.value.destination,
        travelDate: data.value.travelDate,
        authorName: authorName.value.trim() || undefined,
        detail: combinedNote || undefined,
        changes,
        url,
      })
      agNotifyText.value = text
      const ok = await copyText(text)
      agNotifyTip.value = ok
        ? `通知文案已复制，去微信粘贴发给 ${ownerName.value} 同步 ✅`
        : '通知文案已生成，请长按上方文字手动复制'
    }
    // 更新基线（下一轮基于新基线检测变更）
    initialAgProfit2Mode.value = agProfit2Mode.value
    initialAgProfit2.value = Number(agProfit2.value) || 0
    initialAgItinerary.value = { days: itinerary.value.days.map((dd) => ({ day: dd.day, city: dd.city })) }
    if (combinedNote) await loadFeedback()
    agFbText.value = ''
    agSaveOk.value = `已保存行程与报价（对客总价 ¥${Number(gp).toLocaleString()}）并通知 ${ownerName.value}，可把下方链接发回继续协作`
  } catch (e: any) {
    agSaveErr.value = e?.response?.data?.message || e.message || '保存失败'
  } finally {
    agSaving.value = false
  }
}

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

// 旅行社 AI 翻译为泰语版（行程+对客总价）
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

// 状态中文标签（避免 H5 暴露原始机器键）
const STATUS_LABEL: Record<string, string> = {
  consulting: '咨询中',
  awaiting_pk_confirm: '待确认',
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
    const d = await fetchH5Route(token)
    data.value = d
    parseItinerary(d.itinerary)
    // PandaKing：回填价格编辑区（成本①+利润① 来自 items，利润② 来自 totals）
    if (d.role === 'pandaking' && !d.public && d.quote?.items) {
      quoteItems.value = (d.quote.items as any[]).map((it) => ({
        name: it.name ?? '',
        type: it.type || 'other',
        cost1: Number(it.cost1) || 0,
        profit1Mode: (it.profit1Mode as 'amount' | 'percent') ?? 'amount',
        profit1: Number(it.profit1) || 0,
      }))
      const tot = d.quote.totals
      pkProfit2Mode.value = (tot?.profit2Mode as 'amount' | 'percent') ?? 'amount'
      pkProfit2.value = Number(tot?.profit2) || 0
    }
    // 旅行社：回填利润②
    if (d.role === 'agency' && !d.public && d.quote?.totals) {
      const tot = d.quote.totals
      agProfit2Mode.value = (tot.profit2Mode as 'amount' | 'percent') ?? 'amount'
      agProfit2.value = Number(tot.profit2) || 0
      // 记录本轮编辑基线（用于计算「本轮关键变更摘要」，多轮协作逐轮核对）
      initialAgProfit2Mode.value = agProfit2Mode.value
      initialAgProfit2.value = Number(agProfit2.value) || 0
      initialAgItinerary.value = { days: itinerary.value.days.map((dd) => ({ day: dd.day, city: dd.city })) }
    }
    const title = `${safeText(d.destination) || '定制行程'} · 定制行程方案`
    document.title = title
    updateOgMeta('og:title', title)
    if (isPublicView.value) {
      updateOgMeta(
        'og:description',
        `PandaKing9 为您定制的${safeText(d.destination) || '行程'}方案${d.guestPrice != null ? `，对客总价 ¥${d.guestPrice.toLocaleString()}` : ''}`,
      )
    } else if (d.role === 'agency') {
      updateOgMeta(
        'og:description',
        `PandaKing9 为您定制的${safeText(d.destination) || '行程'}方案，报价A ¥${agQuoteA.value.toLocaleString()}（您的成本基线）`,
      )
    } else {
      updateOgMeta(
        'og:description',
        `PandaKing9 协作编辑页：${safeText(d.destination) || '行程'}，报价A ¥${pkDerived.value.quoteA.toLocaleString()}`,
      )
    }
    await loadFeedback()
  } catch {
    notFound.value = true
    document.title = '协作链接无效 · PandaKing9'
  } finally {
    loading.value = false
  }
})

// 反馈提交：生成带「对端可编辑链接」的通知文案（形成 PandaKing↔旅行社反复往返闭环）
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
    if (data.value) {
      // 反馈接收方恒为对端：PandaKing 视图 → 发 agency 可编辑链接；agency/公开视图 → 发 pandaking 可编辑链接
      let url = ''
      let eventLabel = '提交了修改意见'
      let author = authorName.value.trim() || undefined
      if (isPkView.value) {
        url = data.value.agencyToken ? agencyH5Url(data.value.agencyToken) : shareH5Url(token)
        eventLabel = '回复了修改意见'
        author = author || ownerName.value
      } else if (isAgencyView.value) {
        url = data.value.pandakingToken ? pandakingH5Url(data.value.pandakingToken) : shareH5Url(token)
      } else {
        url = data.value.pandakingToken ? pandakingH5Url(data.value.pandakingToken) : shareH5Url(token)
      }
      const text = collabNotifyText({
        kind: 'feedback',
        eventLabel,
        subject: safeName(data.value.customerNameCn, data.value.customerName),
        destination: data.value.destination,
        travelDate: data.value.travelDate,
        authorName: author,
        detail: content,
        url,
      })
      notifyText.value = text
      const ok = await copyText(text)
      notifyTip.value = ok
        ? '通知文案已复制，去微信粘贴发给对端即可同步 ✅'
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
      <div class="role-badge" :class="roleBadgeClass">{{ roleBadgeText }}</div>

      <!-- ============ PandaKing 视角：全量编辑行程 + 价格 ============ -->
      <template v-if="isPkView">
        <section class="h5-edit-section">
          <h3>💰 报价编辑（成本① + 利润①）</h3>
          <p class="hint">您可调整成本①与利润①、设定报价A；利润②（对客附加）由旅行社设定，此处仅作只读预览。修改后生成新版本并同步给旅行社。</p>
          <QuoteTable v-model:items="quoteItems" role="pandaking" />
          <!-- 利润②（对客价附加）：归境外旅行社，PandaKing 只读预览，不可编辑 -->
          <div class="guest-box">
            <div class="guest-row">
              <span class="guest-label">报价A</span>
              <span class="ro">¥{{ Math.round(pkDerived.quoteA).toLocaleString() }}</span>
            </div>
            <div class="guest-row">
              <span class="guest-label">利润②（旅行社·只读）</span>
              <span class="ro">{{ pkProfit2Mode === 'percent' ? pkProfit2 + '%' : '¥' + Math.round(pkProfit2).toLocaleString() }}</span>
            </div>
            <div class="guest-row total">
              <span class="guest-label">对客总价</span>
              <span class="ro total">¥{{ Math.round(pkGuestPrice).toLocaleString() }}</span>
            </div>
          </div>
          <button class="btn btn-primary" :disabled="pkSaving" @click="onPkSave">
            {{ pkSaving ? '保存中…' : '💾 保存行程与报价' }}
          </button>
          <p v-if="pkSaveErr" class="err">{{ pkSaveErr }}</p>
          <p v-if="pkSaveOk" class="ok">{{ pkSaveOk }} ✅</p>
          <button class="btn ghost share-btn" @click="copyPeerLink">📋 复制对旅行社链接发微信</button>
          <p v-if="pkPeerTip" class="share-tip">{{ pkPeerTip }}</p>
        </section>
      </template>

      <!-- ============ 旅行社视角：行程 + 利润② ============ -->
      <template v-else-if="isAgencyView">
        <div class="h5-quotea-card">
          <div class="h5-quotea-lab">报价A（您的成本基线）</div>
          <div class="h5-quotea-val">¥{{ agQuoteA.toLocaleString() }}</div>
        </div>
        <section class="h5-ag-section">
          <h3>💹 加价（利润②）</h3>
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
          <!-- 本轮变更摘要（旅行社加价 + 行程调整实时展示） -->
          <div v-if="agHasChange" class="ch-summary">
            <h4>📋 本轮变更摘要</h4>
            <pre>{{ formatQuoteChanges(agChanges) }}</pre>
          </div>
          <!-- 补充说明（可选） -->
          <div class="h5-fb-field">
            <label>补充说明（可选）</label>
            <textarea v-model="agFbText" rows="2" placeholder="如有额外说明可在此补充；变更摘要会自动合并提交"></textarea>
          </div>

          <button class="btn btn-primary" :disabled="agSaving" @click="onAgSave">
            {{ agSaving ? '保存中…' : '💾 保存并微信回传' }}
          </button>
          <p v-if="agSaveErr" class="err">{{ agSaveErr }}</p>
          <p v-if="agSaveOk" class="ok">{{ agSaveOk }}</p>
          <div v-if="agNotifyText" class="notify-box">
            <div class="notify-head">
              <span>{{ agNotifyTip || ('通知文案（去微信粘贴发给 ' + ownerName + '）') }}</span>
              <button class="btn ghost sm" @click="copyText(agNotifyText)">再复制</button>
            </div>
            <pre class="notify-text">{{ agNotifyText }}</pre>
          </div>

          <button class="btn ghost share-btn" @click="copyPeerLink">📋 复制对 {{ ownerName }} 链接发微信</button>
          <p v-if="agPeerTip" class="share-tip">{{ agPeerTip }}</p>

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
        </section>
      </template>

      <!-- ============ 公开(对客)只读视图 ============ -->
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

      <!-- ============ 行程安排（PandaKing/旅行社 可编辑；公开只读） ============ -->
      <h3>行程安排</h3>
      <div v-if="itinerary.days.length">
        <div v-for="(d, di) in itinerary.days" :key="di" class="day-card">
          <div v-if="canEditItinerary" class="day-row" @click="toggleDay(di)" role="button" tabindex="0" @keydown.enter="toggleDay(di)">
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
          <div v-else class="day-row static">
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

          <div v-if="canEditItinerary && openDays.has(di)" class="day-edit">
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
          <div v-else class="day-readonly">
            <div v-if="d.spots?.length" class="line">景点：{{ d.spots.filter(Boolean).join('、') || '—' }}</div>
            <div v-if="d.hotel" class="line">住宿：{{ d.hotel }}</div>
            <div v-if="d.meals?.length" class="line">餐饮：{{ d.meals.filter(Boolean).join('、') || '—' }}</div>
          </div>
        </div>
        <button v-if="canEditItinerary" class="btn dash" @click="addDay">+ 添加一天</button>
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
            <span>📋 {{ notifyTip || '通知文案（去微信粘贴发给对端）' }}</span>
            <button class="btn ghost sm" @click="copyAgain">再复制</button>
          </div>
          <pre class="notify-text">{{ notifyText }}</pre>
        </div>
      </div>

      <div class="h5-fb-history">
        <h3>历史修改记录</h3>
        <ul v-if="feedbackList.length" class="h5-fb-list">
          <li v-for="fb in feedbackList" :key="fb.id" class="h5-fb-item">
            <div class="h5-fb-meta">
              <span
                class="fb-role"
                :class="fb.authorRole === 'pandaking' ? 'rb-pk' : fb.authorRole === 'agency' ? 'rb-ag' : 'rb-pub'"
              >{{ fb.authorRole ? roleLabel(fb.authorRole) : '协作方' }}</span>
              <b>{{ fb.authorName || (fb.authorRole === 'pandaking' ? 'PandaKing' : fb.authorRole === 'agency' ? '境外旅行社' : '协作方') }}</b>
              <span class="h5-fb-time">{{ fmtTime(fb.createdAt) }}</span>
            </div>
            <p class="h5-fb-content">{{ fb.content }}</p>
          </li>
        </ul>
        <p v-else class="h5-fb-empty">暂无修改记录</p>
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

/* 角色标识条 */
.role-badge { margin: 10px 0 4px; display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.rb-pk { background: var(--brand-50, #fdeef0); color: var(--brand); border: 1px solid var(--brand); }
.rb-ag { background: #e9f1fe; color: #1e40af; border: 1px solid #c2dafe; }
.rb-pub { background: #f4f6fa; color: #3c4655; border: 1px solid #e6e8eb; }

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
.hint { color: var(--muted); font-size: 13px; line-height: 1.6; margin: 0 0 10px; }

/* —— PandaKing / agency 编辑区 —— */
.h5-edit-section { margin-top: 14px; padding: 14px; border: 1px solid var(--brand); border-radius: 12px; background: #fff; }
.h5-edit-section h3 { margin-top: 0; color: var(--brand-600, #a60d26); }
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

/* —— 行程日卡片（可编辑/只读共用） —— */
.day-card { border: 1px solid var(--line); border-radius: 10px; margin: 8px 0; overflow: hidden; background: #fff; }
.day-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; }
.day-row[role="button"] { cursor: pointer; user-select: none; }
.day-row[role="button"]:hover { background: var(--surface-2, #fbfcfe); }
.day-row.static { cursor: default; }
.day-badge { width: 32px; height: 32px; border-radius: 8px; background: var(--brand-50, #fdeef0); color: var(--brand); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 12px; flex-shrink: 0; }
.day-summary { flex: 1; min-width: 0; }
.day-city { display: block; font-size: 14px; font-weight: 600; color: var(--ink); margin-bottom: 2px; }
.day-meta { display: flex; flex-wrap: wrap; gap: 6px; }
.day-tag { background: var(--bg, #f4f6fa); border-radius: 4px; padding: 1px 6px; font-size: 11px; color: var(--muted); }
.day-chev { font-size: 14px; color: var(--muted); transition: transform .2s; flex-shrink: 0; }
.day-chev.open { transform: rotate(180deg); color: var(--brand); }
.day-edit { border-top: 1px solid var(--line); padding: 12px; background: var(--surface-2, #fbfcfe); }
.day-field-row { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
.day-field { display: flex; flex-direction: column; gap: 4px; }
.day-field label { font-size: 12px; color: var(--muted); font-weight: 500; }
.day-field input { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; }
.day-field.full { margin-bottom: 8px; }
.day-inline-row { display: flex; gap: 6px; margin-bottom: 6px; }
.day-inline-row input { flex: 1; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; }
.day-actions { margin-top: 8px; display: flex; justify-content: flex-end; }
.day-readonly { padding: 10px 12px; background: var(--surface-2, #fbfcfe); }
.btn { width: 100%; margin-top: 8px; padding: 10px; border: 1px solid var(--line-strong); background: var(--surface); border-radius: 10px; cursor: pointer; font-size: 14px; font-family: inherit; }
.btn-primary { background: var(--brand); color: #fff; border: none; padding: 12px; font-weight: 700; }
.btn-primary:disabled { opacity: 0.6; }
.btn.ghost { background: transparent; border: none; margin-top: 0; }
.btn.ghost.xs { padding: 2px 6px; font-size: 12px; width: auto; }
.btn.ghost.sm { padding: 4px 10px; font-size: 12px; width: auto; }
.btn.dash { background: var(--teal-50, #e6f7f0); color: var(--teal-600, #0f9d6f); border: 1px dashed var(--teal-200, #b8ead8); width: 100%; }

/* 报价表内嵌间距微调 */
.h5-edit-section :deep(.quote) { margin-top: 8px; }

/* —— 利润②（对客价附加）块 —— */
.guest-box { margin-top: 14px; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; background: var(--surface); }
.guest-row { display: flex; align-items: center; gap: 10px; margin: 6px 0; }
.guest-label { color: var(--muted); font-size: 13px; min-width: 130px; }
.guest-row.total { border-top: 1px dashed var(--line); padding-top: 8px; margin-top: 8px; }
.guest-row.total .guest-label { color: var(--ink); font-weight: 600; }
.guest-box .mode { width: auto; min-width: 56px; }
.guest-box input[type=number] { width: 140px; padding: 6px 8px; border: 1px solid var(--line); border-radius: 6px; font-size: 14px; box-sizing: border-box; }
.h5-quotea-card { margin: 14px 0; padding: 14px 16px; background: #fdeef0; border-radius: 12px; display: flex; align-items: baseline; justify-content: space-between; border: 1px solid var(--brand); }
.h5-quotea-lab { color: var(--brand-600, #a60d26); font-size: 13px; font-weight: 600; }
.h5-quotea-val { color: var(--brand); font-size: 24px; font-weight: 800; }
.ro { font-weight: 600; }
.ro.total { color: var(--brand); font-size: 18px; }
.h5-ag-translate { margin-top: 12px; }

/* 离屏渲染容器：保留布局尺寸供 html2canvas 截图，并移出可视区 */
.pdf-offscreen { position: fixed; left: -10000px; top: 0; width: 794px; background: #fff; z-index: -1; }
</style>
