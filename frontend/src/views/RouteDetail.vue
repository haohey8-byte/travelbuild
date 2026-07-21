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
  submitConsoleFeedback,
  listCostInquiries,
  applyCostInquiry,
  ensureProvincialShare,
  ensureAgencyShare,
  ensurePandakingShare,
} from '@/api/routes'
import { fetchAgencies } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'
import { safeName, safeText } from '@/utils/name'
import {
  shareH5Url,
  shareH5Caption,
  agencyH5Url,
  pandakingH5Url,
  collabNotifyText,
  roleLabel,
  copyText,
  provincialRouteH5Url,
  diffQuoteChanges,
  formatQuoteChanges,
} from '@/utils/share'
import type { ProvincialChanges } from '@/utils/share'
import type { Route, RouteVersion, RouteStatusKey, QuoteLevel, RouteFeedbackItem, Agency, CostInquiry } from '@/types'
import { buildPdfModel, type PdfModel } from '@/utils/pdf-model'
import { calcDerived, calcGuestPrice } from '@/utils/quote'
import { genUid } from '@/utils/uid'
import { generatePdf } from '@/utils/pdf-export'
import { PDF_LANG_OPTIONS, PDF_VERSION_LABEL, type PdfLang, type PdfVersion } from '@/utils/pdf-i18n'
import RoutePdf from '@/components/RoutePdf.vue'
import QuoteTable from '@/components/QuoteTable.vue'
import NotifyDialog from '@/components/NotifyDialog.vue'

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
// 编辑区「反馈建议」输入框（agency / provincial 提交给一手 PandaKing 的建议，与状态流转 tab 的反馈分开）
const consSuggestion = ref('')

// —— 协作通知弹窗（发起询价 / 保存并报价 共用 NotifyDialog）——
const inquireDialog = ref(false) // 发起询价（向省地接社）
const quoteDialog = ref(false) // 保存并报价（向境外旅行社）
const dialogText = ref('') // 弹窗展示的结构化文案
const dialogSubtitle = ref('') // 弹窗副标题（说明）

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
  const d = calcDerived(quoteItems.value)
  const gp = calcGuestPrice(d.quoteA, profit2Mode.value, profit2.value)
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
      quote: {
        items: quoteItems.value,
        totals: {
          cost1: d.cost1,
          profit1: d.profit1,
          quoteA: d.quoteA,
          profit2Mode: profit2Mode.value,
          profit2: Number(profit2.value) || 0,
          guestPrice: gp,
        },
      },
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

// 选择「当前有效版本」：优先用含真实行程/报价内容的最新版本，避免空保存把详情页变成空白
function pickCurrentVersion(versions?: RouteVersion[]) {
  if (!versions || versions.length === 0) return undefined
  // 「最新版本」即当前协作上下文（按 createdAt 降序取首条）
  // —— 之前用「第一个有内容的版本」会导致：用户保存了 v_new（带删除后的数据）后，
  // 重开页面却加载到最早的 v_old（带已删除项），造成「删除无效」的假 bug。
  // 与 PRD「最新版本即当前协作上下文」一致。
  const sorted = [...versions].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
    return tb - ta
  })
  return sorted[0]
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

// —— 报价（项目可自定义名称；成本① + 利润1 = 报价A；报价A + 利润2 = 对客价）——
// 价格表已抽取为共用组件 QuoteTable（一手/旅行社/省地接社同页），此处仅保留数据与角色标志。
const quoteItems = ref<QuoteLevel[]>([])
// 境外旅行社利润2（元/%），作用于报价A 合计 → 对客价（由 QuoteTable 双向绑定）
const profit2Mode = ref<'amount' | 'percent'>('amount')
const profit2 = ref(0)
// 变更基线快照：用于多轮协作时计算「本轮关键变更摘要」（与对端逐轮核对价格/行程变化）
const baselineQuoteItems = ref<QuoteLevel[]>([])
const baselineProfit2Mode = ref<'amount' | 'percent'>('amount')
const baselineProfit2 = ref(0)
const baselineItinerary = ref<{ days: { day: number; city: string }[] }>({ days: [] })
// PandaKing 视角「补充说明（可选）」——随「保存并报价 / 发起询价」一并记录为修改说明
const pkSuggestion = ref('')
// 当前角色
const role = computed(() => auth.currentRole)
const isPk = computed(() => role.value === 'pandaking')
const isAgency = computed(() => role.value === 'agency')
const isProv = computed(() => role.value === 'provincial')
// 路线归属账号名（创建者 = PandaKing 平台方），用于替代「一手」字眼，显示具体注册名
const ownerName = computed(() => data.value?.ownerName || 'PandaKing')

// —— 状态流转 ——
const STATUS_LABEL: Record<RouteStatusKey, string> = {
  consulting: '咨询中',
  awaiting_pk_confirm: '待确认',
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

const versionLabel = computed(() => pickCurrentVersion(data.value?.versions)?.version ?? 'v1')

// 实时变更检测（对齐 H5 协作页）：按当前角色可编辑域比对「基线快照 ↔ 当前编辑态」
const currentChanges = computed<ProvincialChanges>(() => {
  const editable: ('cost1' | 'profit1' | 'profit2' | 'itinerary')[] = isPk.value
    ? ['cost1', 'profit1', 'itinerary']
    : isAgency.value
      ? ['profit2', 'itinerary']
      : []
  if (!editable.length) return {}
  return diffQuoteChanges({
    before: {
      items: baselineQuoteItems.value,
      profit2: baselineProfit2.value,
      profit2Mode: baselineProfit2Mode.value,
      itinerary: baselineItinerary.value,
    },
    after: {
      items: quoteItems.value,
      profit2: Number(profit2.value) || 0,
      profit2Mode: profit2Mode.value,
      itinerary: { days: itinerary.value.days.map((d) => ({ day: d.day, city: d.city })) },
    },
    editableFields: editable,
    versionLabel: versionLabel.value,
  })
})
const hasAnyChange = computed(() => {
  const ch = currentChanges.value
  const costChanged = !!ch.cost && ch.cost.items.length > 0
  const profit2Changed = !!ch.totals?.profit2
  const itinChanged = !!ch.itinerary && ch.itinerary.cityChanges.length > 0
  return costChanged || profit2Changed || itinChanged
})

// —— 省地接社协作（一手：用于「发起询价」弹窗的机构选择 + 「状态与协作」tab 的成本询价列表）——
const costInquiries = ref<CostInquiry[]>([])
const loadingInquiries = ref(false)
const collabProvId = ref('') // 「发起询价」弹窗内选定的省地接社机构 ID
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

// 已关联的省地接社机构名：用于「发起询价」按钮文案、弹窗标题与通知文案个性化（需求：显示具体机构名）
const linkedProvName = computed(() => {
  const pid = data.value?.provincialId
  if (!pid) return ''
  return provincialAgencies.value.find((a) => a.id === pid)?.name || ''
})
const inquireTargetLabel = computed(() =>
  linkedProvName.value ? `向"${linkedProvName.value}"咨询` : '向省地接社咨询',
)
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
// 「状态与协作」tab：手动应用省地接社成本①（用于未走「发起询价」自动流程的情况）
async function onApplyInquiry(inqId: string) {
  applyingId.value = inqId
  actionErr.value = ''
  try {
    await applyCostInquiry(inqId)
    actionOk.value = '已将省地接社成本①写入路线报价（成本①）'
    await load()
    await loadInquiries()
  } catch (e: any) {
    actionErr.value = e?.response?.data?.message || '应用失败'
  } finally {
    applyingId.value = ''
  }
}

// 「发起询价」弹窗副标题：解释这个动作是什么
const inquireSubtitle = computed(() =>
  '向省地接社发起本次行程的成本询价：自动保存当前行程与报价，生成统一协作链接（含主题+URL），结构化文案已自动复制，去微信粘贴发给省地接社即可。',
)
// 「保存并报价」弹窗副标题：解释这个动作是什么
const quoteSubtitle = computed(() =>
  '向境外旅行社发报价：自动保存当前报价（含省地接社成本①与您的利润①），生成对旅行社的 H5 链接（含报价A），结构化文案已自动复制，去微信粘贴发给境外旅行社。',
)

// 一手「🤝 发起询价」—— 已关联省地接社则直接生成（与「保存并报价」体验一致，自动保存+弹窗预览+已复制）；未关联才弹窗选机构
async function openInquireDialog() {
  const linkedProv = data.value?.provincialId
  if (linkedProv) {
    collabProvId.value = linkedProv
    await doInquire()
    return
  }
  // 未关联省地接社 → 先自动保存当前行程与报价（如新加的「9座车」成本①），再打开弹窗让用户选机构
  savingNotify.value = true
  actionErr.value = ''
  try {
    await saveVersion(id, {
      itinerary: itinerary.value,
      quote: buildQuote(),
      draft: false,
      notify: false,
    })
    await load()
  } catch (e: any) {
    savingNotify.value = false
    actionErr.value = e?.response?.data?.message || '保存行程失败'
    return
  } finally {
    savingNotify.value = false
  }
  dialogText.value = ''
  dialogSubtitle.value = inquireSubtitle.value
  inquireDialog.value = true
}

// 一手「💼 保存并报价」—— 自动保存 → 生成结构化文案 + URL → 自动复制 → 弹 NotifyDialog
async function openQuoteDialog() {
  if (!data.value) return
  savingNotify.value = true
  actionErr.value = ''
  actionOk.value = ''
  try {
    // 1) 自动保存（写入当前行程 + 报价 + 利润①）
    const res = (await saveVersion(id, {
      itinerary: itinerary.value,
      quote: buildQuote(),
      draft: false,
      notify: false, // 不在此处触发 share（链接由 shareRoute 单独生成）
    })) as { shareToken?: string; shareLink?: string; version?: any }

    // 2) 生成 agency 分享（role='agency', public=false，让旅行社看到 quoteA + 可加利润②）
    const share = await shareRoute(id, 'agency', false)
    const link = agencyH5Url(share.token)

    // 3) 构造结构化文案（仅主题 + 报价A + URL，**不暴露**「成本① / 利润①」等内部信息）
    const caption = shareH5Caption(data.value)
    const profitLabel = profit2Mode.value === 'percent' ? `${profit2.value || 0}%` : `¥${(Number(profit2.value) || 0).toLocaleString()}`
    const d = calcDerived(quoteItems.value)
    const qa = Math.round(d.quoteA)
    const text = `${caption}\n报价A ¥${qa.toLocaleString()}（您的成本基线）\n\n👉 查看并加价回复：${link}`

    // 计算本轮关键变更摘要，合并为修改记录（写入历史修改记录），并附到微信文案
    const changes = currentChanges.value
    const manual = pkSuggestion.value.trim()
    const autoNote = formatQuoteChanges(changes)
    const combinedNote = manual
      ? (hasAnyChange.value ? `${autoNote}\n\n【补充说明】${manual}` : manual)
      : (hasAnyChange.value ? autoNote : '')
    if (combinedNote) {
      try {
        await submitConsoleFeedback(id, combinedNote, user.value?.name || 'PandaKing', 'pandaking')
      } catch {
        /* 变更记录失败不阻断保存 */
      }
    }
    const notifyBody = hasAnyChange.value ? `${text}\n\n${autoNote}` : text
    dialogText.value = notifyBody
    dialogSubtitle.value = quoteSubtitle.value

    // 4) 自动复制到剪贴板
    const ok = await copyText(notifyBody)
    actionOk.value = ok ? '报价链接已生成并复制，去微信粘贴发给境外旅行社 ✅' : '已生成，请手动复制下方文案'

    // 5) 弹 NotifyDialog
    quoteDialog.value = true
    pkSuggestion.value = ''
    await load()
  } catch (e: any) {
    actionErr.value = e?.response?.data?.message || '生成报价链接失败'
  } finally {
    savingNotify.value = false
  }
}

// 「发起询价」弹窗内用户点确定（先选好机构后）—— 由弹窗内按钮触发
async function doInquire() {
  if (!collabProvId.value.trim()) {
    actionErr.value = '请先选择省地接社机构'
    return
  }
  savingNotify.value = true
  actionErr.value = ''
  try {
    // 1) 自动保存当前状态（含 PandaKing 的行程 + 利润①，但成本① 暂未填）
    await saveVersion(id, {
      itinerary: itinerary.value,
      quote: buildQuote(),
      draft: false,
      notify: false,
    })

    // 2) 生成 provincial 协作链接（幂等）
    const ps = await ensureProvincialShare(id, collabProvId.value.trim())
    const base = provincialRouteH5Url(ps.token)
    const params = new URLSearchParams()
    if (data.value?.destination) params.set('d', data.value.destination)
    const who = safeName(data.value?.customerNameCn, data.value?.customerName)
    if (who) params.set('c', who)
    const qs = params.toString()
    const link = qs ? `${base}?${qs}` : base

    // 3) 构造结构化文案（需求：措辞改为「向你规划路线和询价并回传」，并带上具体省地接社机构名）
    const caption = shareH5Caption(data.value ?? undefined)
    const provAg = provincialAgencies.value.find((a) => a.id === collabProvId.value)
    const targetLabel = provAg?.name ? `（${provAg.name}）` : ''
    const text = `${caption}\n\nPandaKing 已生成行程方案，向你${targetLabel}规划路线和询价并回传：\n\n👉 查看并回复：${link}`

    // 计算本轮关键变更摘要，合并为修改记录（写入历史修改记录），并附到微信文案
    const changes = currentChanges.value
    const manual = pkSuggestion.value.trim()
    const autoNote = formatQuoteChanges(changes)
    const combinedNote = manual
      ? (hasAnyChange.value ? `${autoNote}\n\n【补充说明】${manual}` : manual)
      : (hasAnyChange.value ? autoNote : '')
    if (combinedNote) {
      try {
        await submitConsoleFeedback(id, combinedNote, user.value?.name || 'PandaKing', 'pandaking')
      } catch {
        /* 变更记录失败不阻断保存 */
      }
    }
    const notifyBody = hasAnyChange.value ? `${text}\n\n${autoNote}` : text
    dialogText.value = notifyBody

    // 4) 自动复制
    const ok = await copyText(text)
    actionOk.value = ok ? '询价链接已生成并复制，去微信粘贴发给省地接社 ✅' : '已生成，请手动复制下方文案'

    // 5) 弹出文案预览弹窗（已关联省地接社时弹窗尚未打开需在此打开；未关联场景弹窗已开）
    inquireDialog.value = true
    pkSuggestion.value = ''
    await load()
    await loadInquiries()
  } catch (e: any) {
    actionErr.value = e?.response?.data?.message || '生成询价链接失败'
  } finally {
    savingNotify.value = false
  }
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
    const v = pickCurrentVersion(r.versions)
    if (v?.itinerary && typeof v.itinerary === 'object') {
      const it = v.itinerary as { days?: Day[] }
      itinerary.value = { days: it.days?.length ? it.days : [newDay(1)] }
    } else {
      itinerary.value = { days: [newDay(1)] }
    }
    if (v?.quote && typeof v.quote === 'object') {
      const q = v.quote as { items?: QuoteLevel[]; totals?: Record<string, unknown> }
      quoteItems.value = (q.items ?? []).map((it) => ({ ...it, uid: (it as any).uid || genUid() }))
      const t: any = q.totals || {}
      profit2Mode.value = t.profit2Mode === 'percent' ? 'percent' : 'amount'
      profit2.value = Number(t.profit2) || 0
    } else {
      quoteItems.value = []
      profit2Mode.value = 'amount'
      profit2.value = 0
    }
    // 记录本轮编辑基线（用于计算「本轮关键变更摘要」，多轮协作逐轮核对）
    baselineQuoteItems.value = quoteItems.value.map((it) => ({ ...it }))
    baselineProfit2Mode.value = profit2Mode.value
    baselineProfit2.value = Number(profit2.value) || 0
    baselineItinerary.value = { days: itinerary.value.days.map((d) => ({ day: d.day, city: d.city })) }
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
  const d = calcDerived(quoteItems.value)
  return {
    items: quoteItems.value.map((it) => ({
      name: it.name,
      type: it.type,
      cost1: Number(it.cost1) || 0,
      profit1Mode: (it.profit1Mode as 'amount' | 'percent') ?? 'amount',
      profit1: Number(it.profit1) || 0,
    })),
    totals: {
      cost1: d.cost1,
      profit1: d.profit1,
      quoteA: d.quoteA,
      profit2Mode: profit2Mode.value,
      profit2: Number(profit2.value) || 0,
      guestPrice: calcGuestPrice(d.quoteA, profit2Mode.value, profit2.value),
    },
  }
}

async function onSaveDraft() {
  savingDraft.value = true
  actionErr.value = ''
  actionOk.value = ''
  try {
    await saveVersion(id, {
      itinerary: itinerary.value,
      quote: buildQuote(),
      draft: true,
      notify: false,
    })
    actionOk.value = '草稿已保存'
    await load()
  } catch (e: any) {
    actionErr.value = e?.response?.data?.message || '保存失败'
  } finally {
    savingDraft.value = false
  }
}

async function onAction(a: { key: string; label: string; needNote?: boolean }) {
  if (a.needNote && !feedbackNote.value.trim()) {
    actionErr.value = '请填写反馈内容'
    return
  }
  doing.value = a.key
  actionErr.value = ''
  actionOk.value = ''
  try {
    const note = feedbackNote.value
    const autoNote = formatQuoteChanges(currentChanges.value)
    const combinedNote = note.trim()
      ? (hasAnyChange.value ? `${autoNote}\n\n【补充说明】${note.trim()}` : note.trim())
      : (hasAnyChange.value ? autoNote : '')
    const body = a.needNote ? { feedback: combinedNote || note } : undefined
    await routeAction(id, a.key, body)
    feedbackNote.value = ''
    // 除「拒绝/流失」外，所有状态流转（规划提交类动作）与反馈意见，
    // 都生成「主题 + 事件 + H5 链接」通知文案并复制到剪贴板，便于粘贴到微信群同步协作方。
    if (a.key !== 'reject' && data.value) {
      let link = ''
      try {
        if (isPk.value) {
          // 一手回传反馈 / 状态通知 → 带旅行社「可编辑」链接，形成多轮往返闭环
          const s = await ensureAgencyShare(id)
          link = agencyH5Url(s.token)
        } else if (isAgency.value) {
          // 旅行社回传反馈 / 状态通知 → 带一手「可编辑」链接，对称形成多轮往返闭环
          const s = await ensurePandakingShare(id)
          link = pandakingH5Url(s.token)
        } else if (isProv.value) {
          // 断点2 修复：省地接社回传反馈 / 状态通知 → 带一手「可编辑」链接（原只读链接改为可编辑），
          // 对称形成 PandaKing↔省地接社 多轮往返闭环；成本①/利润①权限隔离不受影响。
          const s = await ensurePandakingShare(id)
          link = pandakingH5Url(s.token)
        } else {
          const s = await shareRoute(id)
          link = s.token ? shareH5Url(s.token) : s.link || ''
        }
      } catch {
        link = ''
      }
      if (link) {
        const isFeedback = !!a.needNote
        const text = collabNotifyText({
          kind: isFeedback ? 'feedback' : 'plan',
          eventLabel: a.label,
          subject: safeName(data.value.customerNameCn, data.value.customerName),
          destination: safeText(data.value.destination),
          travelDate: data.value.travelDate,
          authorName: user.value?.name || roleLabel(role.value),
          detail: isFeedback ? (combinedNote || note) : undefined,
          changes: currentChanges.value,
          url: link,
        })
        const ok = await copyText(text)
        actionOk.value = ok
          ? '通知文案已复制到剪贴板，去微信粘贴到协作群即可同步 ✅'
          : '通知文案已生成，请手动复制下方文案'
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

/* ============================================================
   编辑区保存栏：按三角色统一「保存 / 通知」逻辑
   - 一手 PandaKing：保存草稿 + 保存并通知（生成面向客户的 H5 链接）
   - 境外旅行社 agency：保存草稿 + 提交建议并通知一手（保存加价 + 把建议发给一手，不生成客户链接）
   - 省地接社 provincial：保存草稿 + 保存成本并通知一手（保存行程/成本说明 + 把建议发给一手）
   「保存并通知」对非一手角色 = 一次提交即把工作与建议通知上游，不再额外生成客户 H5 链接。
   ============================================================ */
async function onSubmitSuggestion(who: 'agency' | 'provincial') {
  if (who !== 'agency' && who !== 'provincial') return
  savingNotify.value = true
  actionErr.value = ''
  actionOk.value = ''
  let savedVersion = false
  try {
    // 1) 保存当前编辑（报价加价 / 行程），notify:false → 不生成面向客户的公开 H5 链接
    await saveVersion(id, {
      itinerary: itinerary.value,
      quote: buildQuote(),
      draft: false,
      notify: false,
    })
    savedVersion = true
  } catch (e: any) {
    actionErr.value = e?.response?.data?.message || '保存失败，请重试'
    savingNotify.value = false
    return
  }

  // 2) 提交反馈建议给一手（允许为空：仅保存工作也可）。合并「本轮变更摘要」一并记录
  const note = consSuggestion.value.trim()
  const changes = currentChanges.value
  const autoNote = formatQuoteChanges(changes)
  const combinedNote = note
    ? (hasAnyChange.value ? `${autoNote}\n\n【补充说明】${note}` : note)
    : (hasAnyChange.value ? autoNote : '')
  if (combinedNote) {
    try {
      await submitConsoleFeedback(
        id,
        combinedNote,
        user.value?.name || roleLabel(role.value),
        who,
      )
    } catch (e: any) {
      actionErr.value = e?.response?.data?.message || `建议已保存，但通知 ${ownerName.value} 失败`
      savingNotify.value = false
      return
    }
  }

  // 3) 生成通知文案并复制到剪贴板，便于粘贴到微信群同步协作方
  let link = ''
  try {
    if (who === 'agency') {
      // 旅行社提交建议并通知一手 → 带一手「可编辑」链接，对称形成多轮往返闭环
      const s = await ensurePandakingShare(id)
      link = pandakingH5Url(s.token)
    } else {
      // 断点2 修复：省地接社提交成本建议并通知一手 → 带一手「可编辑」链接（原只读 shareRoute 改为可编辑），
      // 与旅行社分支对称；成本①/利润①权限隔离不受影响（令牌仅指向该 route 的一手协作视图）。
      const s = await ensurePandakingShare(id)
      link = pandakingH5Url(s.token)
    }
  } catch (shareErr: any) {
    actionErr.value = shareErr?.response?.data?.message || '生成分享链接失败，通知文案未生成'
    savingNotify.value = false
    return
  }
  if (!link) {
    actionErr.value = '生成分享链接失败，通知文案未生成'
    savingNotify.value = false
    return
  }
  const text = collabNotifyText({
    kind: note ? 'feedback' : 'plan',
    eventLabel: who === 'agency' ? '提交报价建议' : '提交成本建议',
    subject: safeName(data.value?.customerNameCn, data.value?.customerName),
    destination: safeText(data.value?.destination),
    travelDate: data.value?.travelDate,
    authorName: user.value?.name || roleLabel(role.value),
    detail: combinedNote || undefined,
    changes,
    url: link,
  })
  consSuggestion.value = ''
  try {
    const ok = await copyText(text)
    actionOk.value = ok
      ? `已保存并通知 ${ownerName.value}（通知文案已复制，去微信粘贴到协作群即可 ✅）`
      : `已保存并通知 ${ownerName.value}，请手动复制下方文案`
  } catch {
    actionOk.value = `已保存并通知 ${ownerName.value}，请手动复制下方文案`
  }
  await load()
  await loadFeedback()
  savingNotify.value = false
}

/* ============================================================
   以下均为 v2 高保真 UI 的「只读展示辅助」，不改动任何业务逻辑：
   - 行程日折叠状态
   - 价格回调链路合计（成本①/利润/报价A/对客价）
   - 协作时间线事件（由真实成本询价 + 反馈派生）
   ============================================================ */

// 头部出行日期展示
const travelDateStr = computed(() =>
  data.value?.travelDate ? new Date(data.value.travelDate).toLocaleDateString() : '—',
)

// 行程日折叠：默认展开第一天
const openDays = ref<Set<number>>(new Set([0]))
function toggleDay(i: number) {
  const s = new Set(openDays.value)
  s.has(i) ? s.delete(i) : s.add(i)
  openDays.value = s
}
function addDayOpen() {
  addDay()
  const s = new Set(openDays.value)
  s.add(itinerary.value.days.length - 1)
  openDays.value = s
}
function spotCount(d: Day) {
  return d.spots.filter((x) => x && x.trim()).length
}
function mealCount(d: Day) {
  return d.meals.filter((x) => x && x.trim()).length
}
// 是否已有任何真实行程内容（用于展示「暂无行程」空状态，避免看起来像空白 bug）
const hasItineraryContent = computed(() =>
  itinerary.value.days.some(
    (d) =>
      (d.city && d.city.trim()) ||
      (d.hotel && d.hotel.trim()) ||
      d.spots.some((s) => s && s.trim()) ||
      d.meals.some((m) => m && m.trim()),
  ),
)

// 价格回调链路合计
const derivedTotals = computed(() => calcDerived(quoteItems.value))
const guestTotal = computed(() =>
  calcGuestPrice(derivedTotals.value.quoteA, profit2Mode.value, profit2.value),
)
function yuan(n: number) {
  return '¥' + Math.round(Number(n) || 0).toLocaleString()
}

// 省地接社协作卡状态标签
const collabStatusLabel = computed(() => {
  if (!costInquiries.value.length) return '未发起'
  if (costInquiries.value.some((c) => c.status === 'submitted')) return '已回传'
  return '待回传'
})

// 协作时间线（由真实成本询价 + 反馈派生，按时间升序）
interface CollabEvent {
  key: string
  role: 'pk' | 'prov' | 'ag'
  actor: string
  html: string
  dateStr: string
  timeStr: string
  tags: { text: string; cb?: 'prov2pk' | 'pk2ag' }[]
  ts: number
}
const collabEvents = computed<CollabEvent[]>(() => {
  const evts: CollabEvent[] = []
  const provName = (pid: string) =>
    provincialAgencies.value.find((a) => a.id === pid)?.name || pid
  for (const ci of costInquiries.value) {
    evts.push({
      key: 'ci-start-' + ci.id,
      role: 'pk',
      actor: 'PandaKing',
      html: `发起协作，邀请 <b>${provName(ci.provincialId)}</b> 回填成本明细。`,
      tags: [{ text: '状态 已发送' }],
      ts: new Date(ci.createdAt).getTime(),
      dateStr: '',
      timeStr: '',
    })
    if (ci.status === 'submitted') {
      const n = ci.costItems?.length || 0
      evts.push({
        key: 'ci-back-' + ci.id,
        role: 'prov',
        actor: provName(ci.provincialId),
        html: `回填成本①：<b>${n} 项</b>，合计 <b>${ci.cost1 != null ? yuan(ci.cost1) : '—'}</b>。`,
        tags: [{ text: '状态 已提交' }, { text: '回填 PandaKing 成本①', cb: 'prov2pk' }],
        ts: new Date(ci.createdAt).getTime() + 1,
        dateStr: '',
        timeStr: '',
      })
    }
  }
  for (const fb of feedbackList.value) {
    const fRole: 'pk' | 'prov' | 'ag' =
      fb.source === 'h5'
        ? 'ag'
        : fb.authorRole === 'agency'
          ? 'ag'
          : fb.authorRole === 'provincial'
            ? 'prov'
            : 'pk'
    const fTagText = fb.source === 'h5' ? 'H5 反馈' : fRole === 'pk' ? '回传反馈' : '提交给 ' + ownerName.value
    const fCb = fb.source === 'h5' ? 'pk2ag' : fRole === 'pk' ? undefined : 'prov2pk'
    evts.push({
      key: 'fb-' + fb.id,
      role: fRole,
      actor: fb.authorName || (fb.source === 'h5' ? '协作方' : roleLabel(fb.authorRole) || '协作方'),
      html: fb.content,
      tags: [{ text: fTagText, cb: fCb }],
      ts: new Date(fb.createdAt).getTime(),
      dateStr: '',
      timeStr: '',
    })
  }
  evts.sort((a, b) => a.ts - b.ts)
  return evts.map((e) => {
    const d = new Date(e.ts)
    const ok = !isNaN(d.getTime())
    return {
      ...e,
      dateStr: ok ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : '',
      timeStr: ok ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '',
    }
  })
})
</script>

<template>
  <div class="detail-v2">
    <p v-if="loading" class="loading">加载中…</p>
    <p v-else-if="err" class="err">{{ err }}</p>

    <template v-else-if="data">
      <!-- 头部 -->
      <div class="head">
        <div class="left">
          <button class="back" title="返回看板" @click="router.push('/routes/kanban')">‹</button>
          <div>
            <h1>{{ displayName(data) }}</h1>
            <div class="chips">
              <span class="chip"><b>客户</b>{{ displayName(data) }}</span>
              <span class="chip"><b>国籍</b>{{ data.country || '—' }}</span>
              <span class="chip"><b>人数</b>{{ data.groupSize }} 人</span>
              <span class="chip"><b>出行</b>{{ travelDateStr }}</span>
              <span class="chip"><b>旅行社</b>{{ safeText(data.agency) || '—' }}</span>
              <span class="chip"><b>模式</b>{{ data.modeKey === 'collab' ? '协作' : '自营' }}</span>
            </div>
          </div>
        </div>
        <div class="actions">
          <span class="pill" :class="'st-' + data.statusKey">{{ STATUS_LABEL[data.statusKey] }}</span>
          <button v-if="canExportPdf" class="d-btn ghost" @click="pdfPanelOpen = !pdfPanelOpen">📄 导出PDF</button>
        </div>
      </div>

      <!-- PDF 多语言导出面板 -->
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
          <button class="d-btn primary" :disabled="pdfBusy" @click="onExportPdf">
            {{ pdfBusy ? '生成中…' : '生成并下载 PDF' }}
          </button>
          <button class="d-btn ghost" @click="pdfPanelOpen = false">取消</button>
        </div>
        <p v-if="pdfErr" class="err">{{ pdfErr }}</p>
      </div>

      <p v-if="actionErr" class="err msg">{{ actionErr }}</p>
      <p v-if="actionOk" class="ok msg">{{ actionOk }}</p>

      <!-- 离屏 PDF 渲染容器（导出时填充，不直接显示） -->
      <div ref="pdfWrap" class="pdf-offscreen" aria-hidden="true">
        <RoutePdf v-if="pdfModel" :model="pdfModel" />
      </div>

      <!-- 分段切换 -->
      <div class="seg">
        <button :class="['seg-btn', { on: tab === 'edit' }]" @click="tab = 'edit'">行程与报价</button>
        <button :class="['seg-btn', { on: tab === 'info' }]" @click="tab = 'info'">客户与版本</button>
        <button :class="['seg-btn', { on: tab === 'flow' }]" @click="tab = 'flow'">状态与协作</button>
      </div>

      <!-- ============ 行程与报价（两栏）============ -->
      <div v-if="tab === 'edit'" class="cols">
        <!-- 左：行程路线 -->
        <div class="panel">
          <div class="panel-head">
            <h2>行程路线</h2>
            <span class="pill st-neutral sm">共 {{ itinerary.days.length }} 天</span>
          </div>

          <p v-if="!hasItineraryContent" class="itinerary-empty">
            该路线暂未规划行程，可直接编辑下方第 1 天，或点「＋ 新增一天」开始排期。
          </p>

          <div v-for="(d, di) in itinerary.days" :key="di" class="day">
            <div class="day-row" @click="toggleDay(di)">
              <div class="day-badge">D{{ d.day }}</div>
              <div class="day-main">
                <div class="day-title">{{ d.city || ('第 ' + d.day + ' 天') }}</div>
                <div class="day-sub">
                  <span v-if="d.hotel" class="tag"><b>住宿</b>{{ d.hotel }}</span>
                  <span class="tag"><b>景点</b>{{ spotCount(d) }} 处</span>
                  <span class="tag"><b>用餐</b>{{ mealCount(d) }} 项</span>
                </div>
              </div>
              <div class="chev" :class="{ open: openDays.has(di) }">▾</div>
            </div>

            <div v-show="openDays.has(di)" class="day-edit">
              <div class="grid">
                <div class="field"><label>城市 / 区域</label><input v-model="d.city" placeholder="如 成都" /></div>
                <div class="field"><label>住宿酒店</label><input v-model="d.hotel" placeholder="酒店" /></div>
              </div>
              <div class="field full">
                <label>景点 / 活动</label>
                <div v-for="(s, si) in d.spots" :key="si" class="inline">
                  <input v-model="d.spots[si]" placeholder="景点名称" />
                  <button class="mini-del" title="删除" @click="removeSpot(d, si)">×</button>
                </div>
                <button class="mini-add" @click="addSpot(d)">＋ 景点</button>
              </div>
              <div class="field full">
                <label>餐饮</label>
                <div v-for="(m, mi) in d.meals" :key="mi" class="inline">
                  <input v-model="d.meals[mi]" placeholder="餐饮安排（如 早 / 晚）" />
                  <button class="mini-del" title="删除" @click="removeMeal(d, mi)">×</button>
                </div>
                <button class="mini-add" @click="addMeal(d)">＋ 餐饮</button>
              </div>
              <div class="edit-bar">
                <button class="del" @click="removeDay(di)">删除当天</button>
                <button class="ok" @click="toggleDay(di)">收起</button>
              </div>
            </div>
          </div>

          <div class="add-day">
            <button class="d-btn dash" @click="addDayOpen">＋ 新增一天</button>
          </div>
        </div>

        <!-- 右：报价明细 -->
        <div class="panel">
          <div class="panel-head">
            <h2>报价明细</h2>
            <span class="pill st-role">报价方 · {{ roleLabel(role) }}</span>
          </div>

          <div class="panel-body">
            <p v-if="isProv" class="hint">
              省地接社只需填写<b>报价</b>（利润默认 0）；报价保存后即时回填 {{ ownerName }}。左侧行程规划可直接编辑。
            </p>
            <p v-else-if="isAgency" class="hint">
              您看到的「报价A」是 {{ ownerName }} 的报价（即您的成本），在此加上<b>利润</b>即生成对客价。填好后点击下方「提交建议并通知 {{ ownerName }}」，即可把报价与修改建议一并发送给 {{ ownerName }}。
            </p>
            <QuoteTable v-model:items="quoteItems" v-model:profit2Mode="profit2Mode" v-model:profit2="profit2" :role="role" />
            <p v-if="isPk" class="tip">
              境外旅行社打开同一页面（角色=旅行社）时，报价A 即为其成本，加利润生成对客价。agency 与 provincial 价格彼此不可见。
            </p>
          </div>

          <!-- 一手：本轮变更摘要 + 补充说明（可选） -->
          <div v-if="isPk" class="pk-extra">
            <div v-if="hasAnyChange" class="ch-summary">
              <h4>📋 本轮变更摘要</h4>
              <pre>{{ formatQuoteChanges(currentChanges) }}</pre>
            </div>
            <div class="suggest">
              <label>补充说明（可选）</label>
              <textarea v-model="pkSuggestion" rows="2" placeholder="如有额外说明可在此补充；变更摘要会自动合并提交"></textarea>
            </div>
          </div>

          <!-- 一手：发起询价 + 保存并报价（双主操作，弹 NotifyDialog 统一弹结构化文案+URL） -->
          <div v-if="isPk" class="pk-actions">
            <button class="d-btn primary block" :disabled="savingDraft || savingNotify" @click="openInquireDialog">
              🤝 发起询价（{{ inquireTargetLabel }}）
            </button>
            <button class="d-btn primary block" :disabled="savingDraft || savingNotify" @click="openQuoteDialog">
              💼 保存并报价（向境外旅行社报价）
            </button>
            <button class="d-btn ghost block" :disabled="savingDraft || savingNotify" @click="onSaveDraft">
              {{ savingDraft ? '保存中…' : '💾 仅保存（不通知任何人）' }}
            </button>
          </div>

          <!-- 非一手：反馈建议输入框（提交给一手 PandaKing） -->
          <div v-if="isAgency || isProv" class="suggest">
            <label>补充说明（可选）</label>
            <textarea v-model="consSuggestion" rows="2" :placeholder="isAgency ? ('填写对报价 / 行程的修改建议，将随报价一并通知 ' + ownerName) : ('填写成本说明或协作备注，将通知 ' + ownerName)"></textarea>
          </div>

          <!-- 非一手：本轮变更摘要（旅行社加价 / 行程调整后实时展示） -->
          <div v-if="isAgency && hasAnyChange" class="ch-summary">
            <h4>📋 本轮变更摘要</h4>
            <pre>{{ formatQuoteChanges(currentChanges) }}</pre>
          </div>

          <!-- 非一手：保存栏（与一手对称：仅保存 + 提交建议并通知） -->
          <div v-if="!isPk" class="savebar">
            <button class="d-btn ghost" :disabled="savingDraft || savingNotify" @click="onSaveDraft">
              {{ savingDraft ? '保存中…' : '仅保存' }}
            </button>
            <button class="d-btn primary" :disabled="savingDraft || savingNotify" @click="onSubmitSuggestion(isAgency ? 'agency' : 'provincial')">
              {{ savingNotify ? '提交中…' : (isAgency ? ('提交建议并通知 ' + ownerName) : ('保存成本并通知 ' + ownerName)) }}
            </button>
          </div>

          <!-- 操作结果：紧邻保存栏，让反馈立即可见 -->
          <div class="action-feedback">
            <p v-if="actionErr" class="err msg">{{ actionErr }}</p>
            <p v-if="actionOk && !inquireDialog && !quoteDialog" class="ok msg">{{ actionOk }}</p>
          </div>

          <div class="note">
            简单逻辑：<span class="formula">报价 = 成本 + 利润</span>。利润可按 <b>金额（元）</b> 或 <b>比例（%）</b> 填写，报价自动计算。
            境外旅行社沿用同一公式：<span class="formula">对客价 = 本报价(成本) + 利润</span>。
          </div>
        </div>
      </div>

      <!-- ============ 客户与版本 ============ -->
      <div v-else-if="tab === 'info'" class="panel solo">
        <div class="panel-head"><h2>客户档案</h2></div>
        <div class="panel-body">
          <div class="kv">
            <div><span>客户</span><b>{{ displayName(data) }}</b></div>
            <div><span>国家</span><b>{{ data.country }}</b></div>
            <div><span>旅行社</span><b>{{ safeText(data.agency) || '-' }}</b></div>
            <div><span>人数</span><b>{{ data.groupSize }}</b></div>
            <div><span>出行日期</span><b>{{ travelDateStr }}</b></div>
            <div><span>模式</span><b>{{ data.modeKey === 'collab' ? '协作' : '自营' }}</b></div>
          </div>
          <h3 class="sub-h">版本历史</h3>
          <div class="tbl-wrap">
            <table class="tbl">
              <thead><tr><th>版本</th><th>草稿</th><th>创建时间</th></tr></thead>
              <tbody>
                <tr v-for="v in data.versions" :key="v.id">
                  <td>{{ v.version }}</td>
                  <td>{{ v.draft ? '草稿' : '正式' }}</td>
                  <td>{{ new Date(v.createdAt).toLocaleString() }}</td>
                </tr>
                <tr v-if="!data.versions?.length"><td colspan="3" class="muted">暂无版本</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ============ 状态与协作 ============ -->
      <div v-else class="stack">
        <!-- 状态流转 -->
        <div class="panel solo">
          <div class="panel-head">
            <h2>状态流转</h2>
            <span class="pill" :class="'st-' + data.statusKey">{{ STATUS_LABEL[data.statusKey] }}</span>
          </div>
          <div class="panel-body">
            <p class="hint">状态流转由后端状态机强制校验，非法操作会被拒绝。</p>
            <div class="flow-actions">
              <button
                v-for="a in availableActions"
                :key="a.key"
                class="d-btn"
                :class="{ danger: a.key === 'reject', primary: a.key !== 'reject' }"
                :disabled="!!doing"
                @click="onAction(a)"
              >
                {{ doing === a.key ? '处理中…' : a.label }}
              </button>
            </div>
            <div v-if="availableActions.find((a) => a.needNote)" class="field full" style="margin-top: 14px">
              <label>补充说明（可选）</label>
              <textarea v-model="feedbackNote" rows="3" placeholder="填写要回传给对方 / 旅行社的修改意见"></textarea>
            </div>
          </div>
        </div>

        <!-- 反馈记录 -->
        <div class="panel solo">
          <div class="panel-head">
            <h2>历史修改记录</h2>
            <span v-if="feedbackList.length" class="pill st-role xs">{{ feedbackList.length }}</span>
          </div>
          <div class="panel-body">
            <ul v-if="feedbackList.length" class="fb-list">
              <li v-for="fb in feedbackList" :key="fb.id" class="fb-item">
                <div class="fb-meta">
                  <b>{{ fb.authorName || (fb.source === 'h5' ? '协作方' : 'PandaKing') }}</b>
                  <span class="pill xs" :class="fb.authorRole === 'pandaking' ? 'st-role' : (fb.authorRole === 'agency' ? 'st-awaiting_quote' : 'st-confirmed')">
                    {{ fb.authorRole ? roleLabel(fb.authorRole) : (fb.source === 'h5' ? 'H5 链接反馈' : '回传反馈') }}
                  </span>
                  <span class="fb-time">{{ fmtTime(fb.createdAt) }}</span>
                </div>
                <p class="fb-content">{{ fb.content }}</p>
              </li>
            </ul>
            <p v-else class="muted">暂无修改记录。对方可在协作 H5 链接内提交修改意见，或在此回传反馈。</p>
          </div>
        </div>

        <!-- ===== 协作记录区 v1（PandaKing 专享）===== -->
        <template v-if="isPk">
          <div class="panel solo collab-record">
            <div class="panel-head lock">
              <h2>协作记录</h2>
              <span class="pill st-lock">🔒 PandaKing 专享</span>
            </div>
            <div class="panel-body">
              <div class="lock-sub">🔒 PandaKing 专享 · 省地接社 / 境外旅行社 不可查看</div>

              <!-- 价格回调链路 -->
              <h3 class="sub-h">价格回调链路</h3>
              <div class="flow">
                <div class="node prov">
                  <div class="role">省地接社 填报</div>
                  <div class="amt">{{ yuan(derivedTotals.cost1) }}</div>
                  <div class="lbl">成本①（按项目）</div>
                </div>
                <div class="arrow">
                  <div class="line">──▶</div>
                  <div class="cap">回填</div>
                </div>
                <div class="node pk">
                  <div class="role">PandaKing 成本①</div>
                  <div class="amt">{{ yuan(derivedTotals.cost1) }}</div>
                  <div class="lbl">+ 利润 {{ yuan(derivedTotals.profit1) }}</div>
                </div>
                <div class="arrow">
                  <div class="line">──▶</div>
                  <div class="cap">报价 A</div>
                </div>
                <div class="node ag">
                  <div class="role">境外旅行社 成本</div>
                  <div class="amt">{{ yuan(derivedTotals.quoteA) }}</div>
                  <div class="lbl">+ 利润 → 对客价 {{ yuan(guestTotal) }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="panel solo">
            <div class="panel-head"><h2>协作时间线</h2></div>
            <div class="panel-body">
              <div v-if="collabEvents.length" class="tl">
                <div v-for="e in collabEvents" :key="e.key" class="ev">
                  <div class="time"><div class="d">{{ e.dateStr }}</div><div class="t">{{ e.timeStr }}</div></div>
                  <div class="ev-body">
                    <div class="actor"><span class="dot" :class="e.role"></span>{{ e.actor }}</div>
                    <div class="act" v-html="e.html"></div>
                    <div class="ev-meta">
                      <span v-for="(tg, ti) in e.tags" :key="ti" :class="tg.cb ? 'cb ' + tg.cb : 'tag'">{{ tg.text }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <p v-else class="muted">暂无协作事件。发起省地接社协作或回传反馈后，将在此形成时间线。</p>

              <!-- 成本询价明细（保留应用成本①） -->
              <h3 class="sub-h">成本询价明细</h3>
              <p v-if="loadingInquiries" class="muted">加载中…</p>
              <div v-else class="tbl-wrap">
                <table class="tbl">
                  <thead><tr><th>省地接社</th><th>状态</th><th>成本①</th><th>操作</th></tr></thead>
                  <tbody>
                    <template v-for="ci in costInquiries" :key="ci.id">
                      <tr>
                        <td>{{ provincialAgencies.find((a) => a.id === ci.provincialId)?.name || ci.provincialId }}</td>
                        <td>
                          <span class="pill xs" :class="ci.status === 'submitted' ? 'st-confirmed' : 'st-awaiting_quote'">
                            {{ ci.status === 'submitted' ? '已回传' : '待回传' }}
                          </span>
                        </td>
                        <td>{{ ci.cost1 != null ? yuan(ci.cost1) : '-' }}</td>
                        <td>
                          <button
                            v-if="ci.status === 'submitted'"
                            class="d-btn ghost sm"
                            :disabled="!!applyingId"
                            @click="onApplyInquiry(ci.id)"
                          >
                            {{ applyingId === ci.id ? '应用中…' : '应用成本①' }}
                          </button>
                          <span v-else class="muted">待回传</span>
                        </td>
                      </tr>
                      <tr v-if="ci.costItems && ci.costItems.length" class="detail-row">
                        <td colspan="4">
                          <ul class="cost-items">
                            <li v-for="(item, idx) in ci.costItems" :key="idx">
                              <span>{{ item.name || '未命名' }}</span>
                              <span>{{ yuan(item.amount) }}</span>
                            </li>
                          </ul>
                        </td>
                      </tr>
                    </template>
                    <tr v-if="!costInquiries.length"><td colspan="4" class="muted">暂无协作</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- ============ 协作通知弹窗（一手复用）============ -->
      <NotifyDialog
        v-model:open="inquireDialog"
        :title="'🤝 发起询价（' + inquireTargetLabel + '）'"
        :subtitle="inquireSubtitle"
        :text="dialogText"
        generate-label="📋 生成询价链接"
        @generate="doInquire"
      >
        <div v-if="!dialogText">
          <div v-if="provincialAgencies.length === 0" class="nd-empty">
            暂无省地接社机构，请先在「账号」页新建一个「省地接社」机构。
          </div>
          <div v-else class="nd-agency-pick">
            <label>选择省地接社机构：</label>
            <select v-model="collabProvId" :disabled="loadingProvincialAgencies">
              <option value="" disabled>{{ loadingProvincialAgencies ? '加载中…' : '请选择' }}</option>
              <option v-for="a in provincialAgencies" :key="a.id" :value="a.id">{{ a.name }}（{{ a.id }}）</option>
            </select>
          </div>
        </div>
      </NotifyDialog>

      <NotifyDialog
        v-model:open="quoteDialog"
        :title="'💼 保存并报价（向境外旅行社报价）'"
        :subtitle="quoteSubtitle"
        :text="dialogText"
      />
    </template>
  </div>
</template>

<style scoped>
/* ===== 9 色阶设计系统（路线详情 v2 + 协作记录区 v1 高保真）===== */
.detail-v2 {
  --k-card: #ffffff; --k-line: #e6e8eb; --k-ink: #1f2329; --k-muted: #8a9099; --k-bg: #f4f5f7;
  --teal-50:#e6f7f1; --teal-200:#5dcaa5; --teal-600:#0f6e56;
  --blue-50:#eaf4fc; --blue-200:#85b7eb; --blue-600:#185fa5; --blue-800:#0e3f73;
  --purple-50:#f1effc; --purple-200:#afa9ec; --purple-600:#534ab7; --purple-800:#3a338a;
  --amber-50:#fef6e7; --amber-200:#fac775; --amber-600:#c8881a; --amber-800:#633806;
  --green-50:#f1f8e8; --green-200:#97c459; --green-600:#3b6d11; --green-800:#27490b;
  --red-50:#fcebeb; --red-200:#f09595; --red-600:#a32d2d; --red-800:#7a1f1f;
  --gray-50:#f4f4f2; --gray-200:#b4b2a9; --gray-800:#444441;
  color: var(--k-ink);
}
.loading { color: var(--k-muted); }

/* ===== 头部 ===== */
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.head .left { display: flex; gap: 12px; align-items: flex-start; }
.back { width: 36px; height: 36px; border-radius: 9px; border: 1px solid var(--k-line); background: #fff; font-size: 18px; cursor: pointer; color: var(--k-muted); flex-shrink: 0; }
.back:hover { background: #fafbfc; }
.head h1 { font-size: 22px; font-weight: 700; margin: 0; }
.chips { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
.chip { background: #fff; border: 1px solid var(--k-line); border-radius: 999px; padding: 4px 11px; font-size: 12px; color: var(--k-ink); }
.chip b { color: var(--k-muted); font-weight: 500; margin-right: 4px; }
.head .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

/* ===== pill ===== */
.pill { display: inline-flex; align-items: center; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; border: 1px solid transparent; white-space: nowrap; }
.pill.sm { font-size: 11px; padding: 3px 10px; }
.pill.xs { font-size: 10px; padding: 2px 8px; font-weight: 600; }
.st-neutral { background: var(--gray-50); border-color: var(--gray-200); color: var(--gray-800); }
.st-role { background: var(--purple-50); border-color: var(--purple-200); color: var(--purple-800); }
.st-lock { background: var(--purple-50); border-color: var(--purple-200); color: var(--purple-800); }
.st-consulting { background: var(--gray-50); border-color: var(--gray-200); color: var(--gray-800); }
.st-awaiting_pk_confirm, .st-awaiting_agency_revision { background: var(--amber-50); border-color: var(--amber-200); color: var(--amber-800); }
.st-awaiting_quote { background: var(--blue-50); border-color: var(--blue-200); color: var(--blue-800); }
.st-awaiting_feedback { background: var(--purple-50); border-color: var(--purple-200); color: var(--purple-800); }
.st-awaiting_confirm, .st-booked { background: var(--teal-50); border-color: var(--teal-200); color: var(--teal-600); }
.st-confirmed { background: var(--green-50); border-color: var(--green-200); color: var(--green-800); }
.st-pending_followup { background: var(--red-50); border-color: var(--red-200); color: var(--red-800); }
.st-lost { background: var(--gray-50); border-color: var(--gray-200); color: var(--gray-800); }

/* ===== 按钮 ===== */
.d-btn { border-radius: 8px; padding: 9px 15px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; font-family: inherit; }
.d-btn.ghost { background: #fff; border-color: var(--k-line); color: var(--k-ink); }
.d-btn.ghost:hover { background: #fafbfc; }
.d-btn.primary { background: var(--teal-600); color: #fff; }
.d-btn.primary:hover { filter: brightness(1.06); }
.d-btn.danger { background: var(--red-50); border-color: var(--red-200); color: var(--red-600); }
.d-btn.danger:hover { filter: brightness(0.98); }
.d-btn.dash { background: var(--teal-50); color: var(--teal-600); border: 1px dashed var(--teal-200); width: 100%; }
.d-btn.sm { padding: 6px 12px; font-size: 12px; border-radius: 7px; }
.d-btn:disabled { opacity: 0.55; cursor: not-allowed; }

/* ===== 消息条 ===== */
.msg { margin: 8px 0; font-size: 13px; }
.err { color: var(--red-600); font-size: 13px; }
.ok { color: var(--teal-600); font-size: 13px; }
.muted { color: var(--k-muted); font-size: 13px; }
.link { color: var(--blue-600); text-decoration: none; font-size: 13px; font-weight: 600; }

.fb-notify { margin: 10px 18px; border: 1px solid var(--teal-200); border-radius: 10px; padding: 10px 12px; background: var(--teal-50); }
.fb-notify-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--teal-600); font-weight: 600; }
.fb-notify-head .d-btn { margin-left: auto; }
.fb-notify-text { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6; color: var(--k-ink); font-family: inherit; }

/* ===== 分段切换 ===== */
.seg { display: inline-flex; gap: 4px; background: #eef0f3; border: 1px solid var(--k-line); border-radius: 10px; padding: 4px; margin-bottom: 16px; flex-wrap: wrap; }
.seg-btn { padding: 7px 16px; border: none; background: transparent; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--k-muted); font-family: inherit; }
.seg-btn.on { background: #fff; color: var(--teal-600); box-shadow: 0 1px 3px rgba(20,32,51,.1); }

/* ===== 两栏 & 面板 ===== */
.cols { display: grid; grid-template-columns: 1.25fr 1fr; gap: 18px; align-items: start; }
.stack { display: flex; flex-direction: column; gap: 16px; }
.panel { background: var(--k-card); border: 1px solid var(--k-line); border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 16px 18px; border-bottom: 1px solid var(--k-line); flex-wrap: wrap; }
.panel-head h2 { font-size: 16px; font-weight: 700; margin: 0; }
.panel-body { padding: 16px 18px; }
.sub-h { font-size: 14px; font-weight: 700; margin: 18px 0 12px; }
.hint { color: var(--k-muted); font-size: 13px; margin: 0 0 12px; }
.tip { color: var(--k-muted); font-size: 12px; margin: 12px 0 0; line-height: 1.6; }

/* ===== 行程日（可折叠）===== */
.day { border-bottom: 1px solid var(--k-line); }
.day:last-of-type { border-bottom: none; }
.itinerary-empty { margin: 12px 18px 0; padding: 10px 12px; background: var(--amber-50); border: 1px dashed var(--amber-200); border-radius: 9px; color: var(--amber-800); font-size: 13px; line-height: 1.6; }
.day-row { display: flex; align-items: center; gap: 14px; padding: 14px 18px; cursor: pointer; }
.day-row:hover { background: #fafbfc; }
.day-badge { width: 40px; height: 40px; border-radius: 10px; background: var(--teal-50); border: 1px solid var(--teal-200); color: var(--teal-600); font-weight: 800; font-size: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.day-main { flex: 1; min-width: 0; }
.day-title { font-weight: 700; font-size: 14px; }
.day-sub { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
.tag { background: var(--k-bg); border: 1px solid var(--k-line); border-radius: 6px; padding: 3px 8px; font-size: 11px; color: var(--k-muted); }
.tag b { color: var(--k-ink); font-weight: 600; margin-right: 3px; }
.chev { color: var(--k-muted); font-size: 13px; transition: transform .2s; flex-shrink: 0; }
.chev.open { transform: rotate(180deg); }

/* 展开编辑 */
.day-edit { padding: 4px 18px 20px 72px; background: #fbfcfd; border-top: 1px dashed var(--k-line); }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field.full { margin-top: 12px; }
.field label { font-size: 12px; color: var(--k-muted); font-weight: 600; }
.field input, .field textarea { background: #fff; border: 1px solid var(--k-line); border-radius: 8px; padding: 8px 10px; font-size: 13px; font-family: inherit; color: var(--k-ink); width: 100%; box-sizing: border-box; }
.field textarea { resize: vertical; min-height: 56px; }
.inline { display: flex; gap: 6px; margin-bottom: 6px; }
.inline input { flex: 1; }
.mini-del { width: 32px; flex-shrink: 0; background: var(--red-50); border: 1px solid var(--red-200); color: var(--red-600); border-radius: 7px; cursor: pointer; font-size: 14px; }
.mini-add { margin-top: 4px; align-self: flex-start; background: var(--teal-50); color: var(--teal-600); border: 1px dashed var(--teal-200); border-radius: 7px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
.edit-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }
.edit-bar .del { background: var(--red-50); border: 1px solid var(--red-200); color: var(--red-600); border-radius: 7px; padding: 6px 12px; font-size: 12px; cursor: pointer; }
.edit-bar .ok { background: var(--teal-600); color: #fff; border: none; border-radius: 7px; padding: 6px 14px; font-size: 12px; cursor: pointer; }
.add-day { display: flex; padding: 14px 18px; border-top: 1px solid var(--k-line); background: #fbfcfd; }

/* ===== 报价面板：协作卡 / 保存栏 / 公式 ===== */
.collab { margin: 14px 18px; padding: 14px; border: 1px solid var(--amber-200); background: var(--amber-50); border-radius: 10px; }
.collab .ttl { font-size: 13px; font-weight: 700; color: var(--amber-800); margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
.collab .body { font-size: 12px; color: var(--k-ink); margin-bottom: 10px; line-height: 1.6; }
.collab-form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.collab-form select { flex: 1; min-width: 160px; background: #fff; border: 1px solid var(--k-line); border-radius: 8px; padding: 8px 10px; font-size: 13px; color: var(--k-ink); }
.link-box { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
.link-box input { flex: 1; background: #fff; border: 1px solid var(--k-line); border-radius: 8px; padding: 8px 10px; font-size: 12px; color: var(--k-muted); box-sizing: border-box; }
.savebar { display: flex; gap: 10px; padding: 14px 18px; border-top: 1px solid var(--k-line); }
.savebar .d-btn { flex: 1; text-align: center; }
.pk-actions { display: flex; flex-direction: column; gap: 10px; padding: 14px 18px; border-top: 1px solid var(--k-line); }
.pk-actions .d-btn { width: 100%; text-align: center; }
.nd-agency-pick { margin: 8px 0 4px; }
.nd-agency-pick label { display: block; font-size: 12px; color: var(--k-muted); margin-bottom: 6px; }
.nd-agency-pick select { width: 100%; padding: 10px 12px; border: 1px solid var(--k-line); border-radius: 10px; font-size: 14px; font-family: inherit; background: #fff; }
.nd-empty { padding: 12px 14px; border: 1px dashed var(--k-line); border-radius: 8px; color: var(--k-muted); font-size: 13px; }
.action-feedback { padding: 0 18px 8px; }
.action-feedback .msg { margin: 0 0 6px; }
.suggest { padding: 14px 18px 0; }
.suggest label { display: block; font-size: 12px; color: var(--k-muted); font-weight: 600; margin-bottom: 6px; }
.suggest textarea { width: 100%; background: #fff; border: 1px solid var(--k-line); border-radius: 8px; padding: 8px 10px; font-size: 13px; font-family: inherit; color: var(--k-ink); resize: vertical; min-height: 48px; box-sizing: border-box; }
.ch-summary { margin: 14px 18px 0; border: 1px solid var(--teal-200); border-radius: 10px; padding: 10px 12px; background: var(--teal-50); }
.ch-summary h4 { margin: 0 0 6px; font-size: 13px; color: var(--teal-600); }
.ch-summary pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 12px; line-height: 1.6; color: var(--k-ink); font-family: inherit; }
.share-row { display: flex; gap: 12px; align-items: center; padding: 0 18px 4px; }
.note { font-size: 11px; color: var(--k-muted); padding: 8px 18px 16px; line-height: 1.6; }
.formula { display: inline-block; background: var(--purple-50); color: var(--purple-800); border: 1px solid var(--purple-200); border-radius: 6px; padding: 2px 7px; font-weight: 700; font-size: 11px; margin: 0 2px; }

/* ===== 客户与版本 ===== */
.kv { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 24px; }
.kv > div { display: flex; gap: 8px; align-items: baseline; }
.kv span { color: var(--k-muted); width: 72px; flex-shrink: 0; font-size: 13px; }
.kv b { font-weight: 600; }
.tbl-wrap { width: 100%; overflow-x: auto; }
.tbl { width: 100%; border-collapse: collapse; }
.tbl th, .tbl td { padding: 10px 12px; border-bottom: 1px solid var(--k-line); text-align: left; font-size: 13px; }
.tbl th { background: #fbfbfc; color: var(--k-muted); font-weight: 600; font-size: 12px; }
.detail-row td { padding-top: 0; }
.cost-items { list-style: none; margin: 0; padding: 8px 10px; background: var(--k-bg); border-radius: 8px; font-size: 13px; }
.cost-items li { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed var(--k-line); }
.cost-items li:last-child { border-bottom: none; }

/* ===== 状态流转 ===== */
.flow-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.field textarea { width: 100%; }

/* ===== 反馈记录 ===== */
.fb-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.fb-item { border: 1px solid var(--k-line); border-radius: 10px; padding: 10px 12px; background: #fff; }
.fb-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--k-muted); }
.fb-meta b { color: var(--k-ink); }
.fb-time { margin-left: auto; }
.fb-content { margin: 6px 0 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; color: var(--k-ink); }

/* ===== 协作记录区 v1：链路图 + 时间线 ===== */
.panel-head.lock { background: var(--purple-50); }
.lock-sub { color: var(--purple-800); font-weight: 600; font-size: 12px; margin-bottom: 4px; }
.flow { display: flex; align-items: stretch; gap: 0; flex-wrap: wrap; }
.node { flex: 1; min-width: 150px; border-radius: 11px; padding: 12px 14px; border: 1px solid var(--k-line); }
.node .role { font-size: 11px; font-weight: 700; margin-bottom: 6px; }
.node .amt { font-size: 17px; font-weight: 800; }
.node .lbl { font-size: 11px; color: var(--k-muted); margin-top: 3px; }
.node.prov { background: var(--blue-50); border-color: var(--blue-200); }
.node.prov .role, .node.prov .amt { color: var(--blue-800); }
.node.pk { background: var(--teal-50); border-color: var(--teal-200); }
.node.pk .role, .node.pk .amt { color: var(--teal-600); }
.node.ag { background: var(--purple-50); border-color: var(--purple-200); }
.node.ag .role, .node.ag .amt { color: var(--purple-800); }
.arrow { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 10px; min-width: 90px; }
.arrow .line { color: var(--k-muted); font-size: 18px; line-height: 1; font-weight: 700; }
.arrow .cap { font-size: 10px; color: var(--k-muted); margin-top: 3px; text-align: center; font-weight: 600; }

.tl { position: relative; padding-left: 4px; }
.ev { display: flex; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--k-line); }
.ev:last-child { border-bottom: none; }
.ev .time { width: 118px; flex-shrink: 0; }
.ev .time .d { font-size: 12px; font-weight: 700; }
.ev .time .t { font-size: 11px; color: var(--k-muted); }
.ev-body { flex: 1; min-width: 0; }
.ev .actor { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; margin-bottom: 4px; }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.prov { background: var(--blue-600); }
.dot.pk { background: var(--teal-600); }
.dot.ag { background: var(--purple-600); }
.ev .act { font-size: 13px; color: var(--k-ink); line-height: 1.5; word-break: break-word; }
.ev .act :deep(b) { font-weight: 700; }
.ev-meta { margin-top: 6px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cb { font-size: 10px; font-weight: 700; border-radius: 5px; padding: 2px 7px; }
.cb.prov2pk { background: var(--blue-50); color: var(--blue-800); border: 1px solid var(--blue-200); }
.cb.pk2ag { background: var(--purple-50); color: var(--purple-800); border: 1px solid var(--purple-200); }

/* ===== PDF 面板 ===== */
.pdf-panel { border: 1px solid var(--teal-200); border-radius: 10px; padding: 12px 14px; margin: 10px 0; background: var(--teal-50); }
.pdf-panel-row { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-bottom: 8px; }
.pdf-panel-label { font-weight: 600; color: var(--k-muted); min-width: 40px; }
.pdf-opt { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; cursor: pointer; }
.pdf-panel-actions { display: flex; gap: 10px; margin-top: 4px; }
.pdf-offscreen { position: fixed; left: -10000px; top: 0; width: 794px; background: #fff; z-index: -1; }

/* ===== 响应式 ===== */
@media (max-width: 960px) {
  .cols { grid-template-columns: 1fr; }
  .day-edit { padding-left: 18px; }
}
@media (max-width: 640px) {
  .head { flex-direction: column; align-items: stretch; }
  .head .actions { justify-content: space-between; }
  .grid { grid-template-columns: 1fr; }
  .flow .arrow { min-width: 100%; flex-direction: row; padding: 6px 0; gap: 8px; }
  .flow .arrow .line { transform: rotate(90deg); }
  .kv { grid-template-columns: 1fr; }
  .ev { flex-direction: column; gap: 6px; }
  .ev .time { width: auto; display: flex; gap: 8px; align-items: baseline; }
  .seg { width: 100%; }
  .seg-btn { flex: 1; }
}
@media (max-width: 480px) {
  .head { gap: 10px; margin-bottom: 12px; }
  .head .actions { width: 100%; }
  .head .actions .d-btn { flex: 1; min-width: 0; }
  .panel-head { padding: 14px; }
  .savebar { padding: 12px 14px; }
  .pk-actions { padding: 12px 14px; }
  .ch-summary { margin: 12px 14px 0; }
  .day-row { padding: 12px 14px; }
  .day-edit { padding: 12px 14px; }
  .collab-form { gap: 8px; }
  .collab-form select { min-width: 0; }
  .link-box { flex-direction: column; align-items: stretch; }
  .link-box input { width: 100%; }
  .node { padding: 10px 12px; }
  .flow .arrow { padding: 8px 0; }
}
</style>
