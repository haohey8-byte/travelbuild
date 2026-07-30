<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
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
  assignProvincial,
  ensureProvincialShare,
  ensureAgencyShare,
  ensurePandakingShare,
  assignAgency,
} from '@/api/routes'
import { fetchH5Route, fetchH5Feedback, assignProvincialByToken, submitH5Feedback, submitH5PandakingEdit } from '@/api/h5'
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
  toGuestPriceChanges,
  formatItineraryChanges,
} from '@/utils/share'
import type { ProvincialChanges } from '@/utils/share'
import type { Route, RouteVersion, RouteStatusKey, QuoteLevel, RouteFeedbackItem, Agency, CostInquiry, Role, Quote, H5Route } from '@/types'
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
// 移动枢纽（token 模式）：通过 pandakingToken 深链免登录驱动（路由 /h5/pk-route/:token）。
// 该模式下角色恒为 'pandaking'，所有读写走 token 端点而非 JWT 控制台接口。
const token = route.params.token as string | undefined
const tokenMode = computed(() => !!token)

const data = ref<Route | null>(null)
// token 模式下保存后端返回的 H5 视图（含对端令牌与省地接社机构列表）
const h5 = ref<H5Route | null>(null)
const loading = ref(true)
const err = ref('')
const tab = ref<'edit' | 'info' | 'flow'>('edit')
const actionErr = ref('')
const actionOk = ref('')
const savingDraft = ref(false)
const savingNotify = ref(false)
const doing = ref('')
// 编辑区「反馈建议」输入框（agency / provincial 提交给 PandaKing 的建议，与状态流转 tab 的反馈分开）
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

// 版本开放范围（权限矩阵 4.7 / 5.8）：=全部；旅行社=旅行社版+游客版；其余无
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

// —— 反馈记录（H5 链接反馈 + 回传反馈，协作双方可见）——
const feedbackList = ref<RouteFeedbackItem[]>([])
async function loadFeedback() {
  try {
    const list = await fetchRouteFeedback(id)
    // 历史修改记录按时间逆序展示（最新在最上面）：后端返回为 createdAt 升序，此处倒序
    feedbackList.value = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
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
  notes?: string
}
const itinerary = ref<{ days: Day[] }>({ days: [newDay(1)] })
function newDay(n: number): Day {
  return { day: n, city: '', spots: [''], hotel: '', meals: [''], notes: '' }
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
// 价格表已抽取为共用组件 QuoteTable（/旅行社/省地接社同页），此处仅保留数据与角色标志。
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
// 当前角色：token 模式（移动枢纽）始终以 PandaKing 身份操作，无需登录
const role = computed(() => (tokenMode.value ? 'pandaking' : auth.currentRole))
// 乐观锁基准：加载时所基于的版本 ID，保存时回传后端做并发校验（防止控制台旧数据覆盖 H5 新修改）
const baseVersionId = ref<string | null>(null)
// 并发冲突提示条（后端返回 409 时置真，展示「立即刷新」按钮）
const conflictRefresh = ref(false)
// 检测是否并发冲突（后端返回 409）：是则展示冲突提示条并写入 actionErr
function detectStale(e: any): boolean {
  if (e?.response?.status === 409) {
    conflictRefresh.value = true
    actionErr.value = '协作方已更新行程/报价，当前页面数据已过期，请刷新后重试。'
    return true
  }
  return false
}
// 「立即刷新」：重新加载最新版本（自动重设 baseVersionId），并收起冲突提示
async function refreshNow() {
  conflictRefresh.value = false
  actionErr.value = ''
  await load()
}
// 页面切回可见且距上次加载 > 30s 时自动刷新，降低基于过期数据保存的概率
let lastLoadTs = 0
function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    const now = Date.now()
    if (now - lastLoadTs > 30000) {
      lastLoadTs = now
      load()
    }
  }
}
const isPk = computed(() => role.value === 'pandaking')
const isAgency = computed(() => role.value === 'agency')
const isProv = computed(() => role.value === 'provincial')
// 只读态：从「系统设置 → 我的路线」打开时为 true，隐藏保存/提交/协作按钮（agency/provincial 概览）
const readonly = computed(() => route.query.ro === '1')
// 路线归属账号名（创建者 = PandaKing 平台方），用于显示具体注册名
const ownerName = computed(() => data.value?.ownerName || 'PandaKing')

// 返回逻辑（非 token 模式）：从「系统设置-我的路线」进入 → 回「我的路线」；
// 否则（路线管理看板 / 路线列表进入）→ 回看板。避免从我的路线误返回到看板。
function goBack() {
  if (route.query.from === 'settings') {
    router.push('/settings?tab=routes')
  } else {
    router.push('/routes/kanban')
  }
}

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
// 报价A 基线（境外旅行社加价前的对客价基础），用于把利润②换算成对客总价
const quoteABase = computed(() => Number(calcDerived(quoteItems.value).quoteA) || 0)
// 面向 PandaKing 的变更摘要：把利润②替换为对客总价，避免向枢纽暴露境外旅行社利润率
const currentChangesForPk = computed<ProvincialChanges>(() => toGuestPriceChanges(currentChanges.value, quoteABase.value))
const hasAnyChange = computed(() => {
  const ch = currentChanges.value
  const costChanged = !!ch.cost && ch.cost.items.length > 0
  const profit2Changed = !!ch.totals?.profit2
  const itinChanged = !!ch.itinerary && ch.itinerary.cityChanges.length > 0
  return costChanged || profit2Changed || itinChanged
})

// 按收件方可见域计算变更摘要（通知文案应展示对方能看到的改动，而非发送方编辑的全部字段）
function buildChanges(fields: ('cost1' | 'profit1' | 'profit2' | 'itinerary')[]): ProvincialChanges {
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
    editableFields: fields,
    versionLabel: versionLabel.value,
  })
}
function checkHasChange(ch: ProvincialChanges) {
  const costChanged = !!ch.cost && ch.cost.items.length > 0
  const profit2Changed = !!ch.totals?.profit2
  const itinChanged = !!ch.itinerary && ch.itinerary.cityChanges.length > 0
  return costChanged || profit2Changed || itinChanged
}
// → 省地接社：仅展示成本① + 行程（利润① 对省地接社不可见，不应出现在摘要）
const changesForProvincial = computed<ProvincialChanges>(() => buildChanges(['cost1', 'itinerary']))
const hasProvincialChange = computed(() => checkHasChange(changesForProvincial.value))
// → 境外旅行社：仅展示利润② + 行程（利润① 是 PandaKing 内部字段，不应向旅行社摘要）
const changesForAgency = computed<ProvincialChanges>(() => buildChanges(['profit2', 'itinerary']))
const hasAgencyChange = computed(() => checkHasChange(changesForAgency.value))

// —— 省地接社协作（：用于「发起询价」弹窗的机构选择 + 「状态与协作」tab 的成本询价列表）——
const costInquiries = ref<CostInquiry[]>([])
const loadingInquiries = ref(false)
const collabProvId = ref('') // 「发起询价」弹窗内选定的省地接社机构 ID
const applyingId = ref('')

// 省地接社「分配 / 改派」轻量弹窗（仅改 route.provincialId，不发通知、不生成 CostInquiry/RouteShare）
const assignDialog = ref(false)
const assignProvId = ref('')
const assigning = ref(false)
const assignErr = ref('')
const assignIsReassign = ref(false)
// 「发起询价」弹窗内的本地报错（不再写入全局 actionErr，反馈紧跟动作）
const inquireErr = ref('')

// 省地接社是否已分配（驱动三态状态条 + 发起询价按钮可用性）
const provAssigned = computed(() => !!data.value?.provincialId)

// 省地接社机构下拉选项（分配/询价用）
const provincialAgencies = ref<Agency[]>([])
const loadingProvincialAgencies = ref(false)
async function loadProvincialAgencies() {
  loadingProvincialAgencies.value = true
  try {
    const all = await fetchAgencies()
    provincialAgencies.value = all.filter((a) => a.role === 'provincial' && !a.disabled)
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
const inquireTargetLabel = computed(() => {
  // 按钮文案跟随「已分配的省地接社」机构名（稳定，来自 linkedProvName）；未分配时按钮禁用，仅作占位提示
  const name = linkedProvName.value
  return name ? `向"${name}"咨询` : '（未分配省地接社）'
})
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
  '向省地接社发起本次行程的成本询价：自动保存当前行程与报价，生成统一协作链接（含主题+URL）。可在此确认当前省地接社或重新选择改派；生成后请在弹窗内点「复制（含链接）」按钮，去微信粘贴发给省地接社。',
)
// 「保存并报价」弹窗副标题：解释这个动作是什么
const quoteSubtitle = computed(() =>
  '向旅行社发报价：自动保存当前报价（含省地接社成本①与您的利润①），生成对旅行社的 H5 链接（含报价A）。请在弹窗内点「复制（含链接）」按钮，去微信粘贴发给旅行社。',
)

// 「保存并报价」弹窗内选定的境外旅行社机构 ID（需求：生成报价链接前先选旅行社）
const quoteAgencyId = ref('')
const quoteAgencies = ref<Agency[]>([])
const loadingQuoteAgencies = ref(false)
const quoteErr = ref('')
async function loadQuoteAgencies() {
  loadingQuoteAgencies.value = true
  try {
    const all = await fetchAgencies()
    quoteAgencies.value = all.filter((a) => a.role === 'agency' && !a.disabled)
  } catch {
    quoteAgencies.value = []
  } finally {
    loadingQuoteAgencies.value = false
  }
}
// 已关联旅行社机构名：用于弹窗「当前已关联」提示与标题个性化
const linkedAgencyName = computed(() => {
  const aid = data.value?.agencyId
  if (!aid) return ''
  return quoteAgencies.value.find((a) => a.id === aid)?.name || data.value?.agency || ''
})
const quoteTargetLabel = computed(() => {
  const name = linkedAgencyName.value
  return name ? `向"${name}"发报价` : '（未关联旅行社）'
})

// 「🏢 分配 / 改派省地接社」—— 轻量弹窗：仅改 route.provincialId，不发通知、不生成 CostInquiry/RouteShare
function openAssignDialog(isReassign: boolean) {
  assignIsReassign.value = isReassign
  assignProvId.value = isReassign ? (data.value?.provincialId || '') : ''
  assignErr.value = ''
  assignDialog.value = true
}
async function confirmAssign() {
  if (!assignProvId.value.trim()) {
    assignErr.value = '请选择省地接社机构'
    return
  }
  assigning.value = true
  assignErr.value = ''
  try {
    if (tokenMode.value && token) {
      // token 模式：免登录直接分配 / 改派省地接社，后端返回刷新后的完整 H5 视图
      const h = await assignProvincialByToken(token, assignProvId.value.trim())
      h5.value = h
      if (data.value) data.value = { ...data.value, provincialId: h.provincialId ?? null }
      provincialAgencies.value = (h.provincialAgencies ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        role: 'provincial' as Role,
        disabled: false,
        createdAt: '',
      }))
      const name = h.provincialAgencies?.find((a) => a.id === assignProvId.value)?.name || '省地接社'
      actionOk.value = `已${assignIsReassign.value ? '改派' : '分配'}省地接社：${name}`
      assignDialog.value = false
    } else {
      await assignProvincial(id, assignProvId.value.trim())
      assignDialog.value = false
      await load() // 刷新 data.provincialId + 三态状态条
      const name = provincialAgencies.value.find((a) => a.id === assignProvId.value)?.name || '省地接社'
      actionOk.value = `已${assignIsReassign.value ? '改派' : '分配'}省地接社：${name}`
    }
  } catch (e: any) {
    assignErr.value = e?.response?.data?.message || '分配失败'
  } finally {
    assigning.value = false
  }
}

// 「🤝 发起询价」—— 仅当已分配省地接社时可打开（按钮已 disabled 未分配态）；
// 不再在打开时自动保存版本（C1：仅点「生成询价链接」由 doInquire 保存），避免污染版本历史
async function openInquireDialog() {
  // 预选当前已关联机构（若有），弹窗内可重新选择改派
  collabProvId.value = data.value?.provincialId || ''
  inquireErr.value = ''
  dialogText.value = ''
  dialogSubtitle.value = inquireSubtitle.value
  inquireDialog.value = true
}

// 「💼 保存并报价」—— 自动保存 → 生成结构化文案 + URL → 自动复制 → 弹 NotifyDialog
async function openQuoteDialog() {
  if (!data.value) return
  savingNotify.value = true
  actionErr.value = ''
  actionOk.value = ''
  try {
    if (tokenMode.value && token) {
      // 防呆：报价为空则拦截，避免误发 ¥0 文案
      if (calcDerived(quoteItems.value).quoteA <= 0) {
        actionErr.value = '当前报价为 ¥0：请先在「报价明细」表填写成本①与利润①并保存，再生成链接'
        savingNotify.value = false
        return
      }
      // token 模式：免登录保存编辑并生成对境外旅行社的「可编辑」链接
      const res = await submitH5PandakingEdit(token, {
        itinerary: itinerary.value,
        quote: buildQuote(),
      })
      const agToken = res.agencyToken ?? h5.value?.agencyToken ?? null
      const link = agToken ? agencyH5Url(agToken) : ''
      const caption = shareH5Caption(data.value, 'agency')
      const d = calcDerived(quoteItems.value)
      const qa = Math.round(d.quoteA)
      const text = `${caption}\n报价 ¥${qa.toLocaleString()}\n\n👉 查看路线及报价：${link}`
      const changes = changesForAgency.value
      const manual = pkSuggestion.value.trim()
      const autoNote = formatQuoteChanges(changes)
      const combinedNote = manual
        ? (hasAgencyChange.value ? `${autoNote}\n\n【补充说明】${manual}` : manual)
        : (hasAgencyChange.value ? autoNote : '')
      if (combinedNote) {
        try {
          await submitH5Feedback(token, combinedNote, h5.value?.ownerName ?? 'PandaKing', 'pandaking')
        } catch {
          /* 变更记录失败不阻断保存 */
        }
      }
      const notifyBody = [text, hasAgencyChange.value ? autoNote : '', manual ? `【补充说明】${manual}` : '']
        .filter(Boolean)
        .join('\n\n')
      dialogText.value = notifyBody
      dialogSubtitle.value = quoteSubtitle.value
      actionOk.value = '报价链接已生成，请在弹窗内点「复制（含链接）」按钮，去微信粘贴发给旅行社'
      quoteDialog.value = true
      pkSuggestion.value = ''
      await loadTokenMode(token) // 重新拉取最新（含对端令牌）
      // 文案报价以「落库后的权威值」为准：loadTokenMode 后 quoteItems 已重填为已保存版本
      const savedQuoteA = Math.round(calcDerived(quoteItems.value).quoteA)
      if (savedQuoteA > 0) {
        const refreshedText = `${caption}\n报价 ¥${savedQuoteA.toLocaleString()}\n\n👉 查看路线及报价：${link}`
        dialogText.value = [refreshedText, hasAgencyChange.value ? autoNote : '', manual ? `【补充说明】${manual}` : '']
          .filter(Boolean)
          .join('\n\n')
      }
    } else {
      // console 模式：先打开带「选择旅行社」下拉的弹窗，由用户点「生成报价链接」触发 doQuote
      await loadQuoteAgencies()
      quoteAgencyId.value = data.value?.agencyId || ''
      quoteErr.value = ''
      dialogText.value = ''
      dialogSubtitle.value = quoteSubtitle.value
      quoteDialog.value = true
    }
  } catch (e: any) {
    if (detectStale(e)) { savingNotify.value = false; return }
    actionErr.value = e?.response?.data?.message || '生成报价链接失败'
  } finally {
    savingNotify.value = false
  }
}

// 「保存并报价」弹窗内用户点「生成报价链接」（先选好旅行社后）—— 由弹窗内按钮触发
async function doQuote() {
  if (!quoteAgencyId.value.trim()) {
    quoteErr.value = '请先选择旅行社机构'
    return
  }
  if (!data.value) return
  savingNotify.value = true
  actionErr.value = ''
  actionOk.value = ''
  try {
    // 0) 防呆：报价为空则拦截，避免误发 ¥0 文案（线上曾出现 items 未落库却生成 ¥0 的事故）
    if (calcDerived(quoteItems.value).quoteA <= 0) {
      quoteErr.value = '当前报价为 ¥0：请先在「报价明细」表填写成本①与利润①并保存，再生成链接'
      savingNotify.value = false
      return
    }

    // 1) 自动保存（写入当前行程 + 报价 + 利润①）
    await saveVersion(id, {
      itinerary: itinerary.value,
      quote: buildQuote(),
      draft: false,
      notify: false, // 不在此处触发 share（链接由 assignAgency 单独生成）
      baseVersionId: baseVersionId.value,
    })

    // 2) 改派/确认旅行社并生成 agency 分享（role='agency', public=false，让旅行社看到 quoteA + 可加利润②）
    const share = await assignAgency(id, quoteAgencyId.value.trim())
    const link = agencyH5Url(share.token)

    // 3) 重新加载权威落库数据（applyVersion 会把 quoteItems 重填为已保存版本），
    //    文案报价以「落库后的真实值」为准，避免编辑态与落库态错位导致 ¥0/错价
    await load()
    const savedQuoteA = Math.round(calcDerived(quoteItems.value).quoteA)
    // 二次防呆：落库后仍为空（极端情况：保存被协作方版本冲突静默覆盖），强制拦截
    if (savedQuoteA <= 0) {
      quoteErr.value = '保存后报价仍为 ¥0：可能协作方已更新此路线。请刷新页面，确认报价明细已填写，再重新生成链接'
      savingNotify.value = false
      return
    }

    // 4) 构造结构化文案（仅主题 + 报价 + URL，不暴露内部信息）
    const caption = shareH5Caption(data.value, 'agency')
    const text = `${caption}\n报价 ¥${savedQuoteA.toLocaleString()}\n\n👉 查看路线及报价：${link}`

    // 计算本轮关键变更摘要（面向境外旅行社：仅利润② + 行程，不含 PandaKing 内部利润①），合并为修改记录，并附到微信文案
    const changes = changesForAgency.value
    const manual = pkSuggestion.value.trim()
    const autoNote = formatQuoteChanges(changes)
    const combinedNote = manual
      ? (hasAgencyChange.value ? `${autoNote}\n\n【补充说明】${manual}` : manual)
      : (hasAgencyChange.value ? autoNote : '')
    if (combinedNote) {
      try {
        await submitConsoleFeedback(id, combinedNote, user.value?.name || 'PandaKing', 'pandaking')
      } catch {
        /* 变更记录失败不阻断保存 */
      }
    }
    const notifyBody = [text, hasAgencyChange.value ? autoNote : '', manual ? `【补充说明】${manual}` : '']
      .filter(Boolean)
      .join('\n\n')
    dialogText.value = notifyBody
    dialogSubtitle.value = quoteSubtitle.value

    // 5) 复制交由 NotifyDialog：打开弹窗时尽力自动复制 + 提供「复制（含链接）」按钮兜底
    actionOk.value = '报价链接已生成，请在弹窗内点「复制（含链接）」按钮，去微信粘贴发给旅行社'

    // 6) 弹 NotifyDialog（dialogText 已赋，slot 内下拉随之隐藏）
    pkSuggestion.value = ''
  } catch (e: any) {
    if (detectStale(e)) {
      // 乐观锁冲突（VERSION_CONFLICT 409）：协作方已更新路线，当前编辑基于过期数据被拒。
      // 显式提示刷新重填，而非静默失败（否则用户会以为已发出 ¥0/旧价文案）。
      quoteErr.value = '数据已过期：协作方已更新此路线的行程或报价，刚刚的保存被拒绝。请刷新页面，重新填写报价后再次生成链接'
      savingNotify.value = false
      return
    }
    actionErr.value = e?.response?.data?.message || '生成报价链接失败'
  } finally {
    savingNotify.value = false
  }
}

// 「发起询价」弹窗内用户点确定（先选好机构后）—— 由弹窗内按钮触发
async function doInquire() {
  if (!collabProvId.value.trim()) {
    inquireErr.value = '请先选择省地接社机构'
    return
  }
  savingNotify.value = true
  inquireErr.value = ''
  try {
    if (tokenMode.value && token) {
      // token 模式：先保存编辑，再免登录分配省地接社并生成其「可编辑」协作链接
      await submitH5PandakingEdit(token, { itinerary: itinerary.value, quote: buildQuote() })
      const assigned = await assignProvincialByToken(token, collabProvId.value.trim())
      h5.value = assigned
      if (data.value) data.value = { ...data.value, provincialId: assigned.provincialId ?? null }
      provincialAgencies.value = (assigned.provincialAgencies ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        role: 'provincial' as Role,
        disabled: false,
        createdAt: '',
      }))
      const pToken = assigned.provincialToken ?? null
      const base = pToken ? provincialRouteH5Url(pToken) : ''
      const params = new URLSearchParams()
      if (data.value?.destination) params.set('d', data.value.destination)
      const who = safeName(data.value?.customerNameCn, data.value?.customerName)
      if (who) params.set('c', who)
      const qs = params.toString()
      const link = qs ? `${base}?${qs}` : base

      // 构造结构化文案（措辞：PandaKing 已拟定初步行程，提交至贵社进行路线优化及报价，并带上具体省地接社机构名）
      const caption = shareH5Caption(data.value ?? undefined)
      const provAg = assigned.provincialAgencies?.find((a) => a.id === collabProvId.value)
      const targetLabel = provAg?.name ? `（${provAg.name}）` : ''
      const text = `${caption}\n\nPandaKing 已拟定初步行程，现提交至贵社${targetLabel}进行路线优化及报价，烦请查收反馈。\n\n👉 查看并回复：${link}`

      // 计算本轮关键变更摘要（面向省地接社：仅成本① + 行程，不含 PandaKing 内部利润①），合并为修改记录，并附到微信文案
      const changes = changesForProvincial.value
      const manual = pkSuggestion.value.trim()
      const autoNote = formatQuoteChanges(changes)
      const combinedNote = manual
        ? (hasProvincialChange.value ? `${autoNote}\n\n【补充说明】${manual}` : manual)
        : (hasProvincialChange.value ? autoNote : '')
      if (combinedNote) {
        try {
          await submitH5Feedback(token, combinedNote, h5.value?.ownerName ?? 'PandaKing', 'pandaking')
        } catch {
          /* 变更记录失败不阻断保存 */
        }
      }
      const notifyBody = [text, hasProvincialChange.value ? autoNote : '', manual ? `【补充说明】${manual}` : '']
        .filter(Boolean)
        .join('\n\n')
      dialogText.value = notifyBody

      // 复制交由 NotifyDialog：打开弹窗时尽力自动复制 + 提供「复制（含链接）」按钮兜底
      actionOk.value = '询价链接已生成，请在弹窗内点「复制（含链接）」按钮，去微信粘贴发给省地接社'
      inquireDialog.value = true
      pkSuggestion.value = ''
      await loadTokenMode(token)
    } else {
    // 1) 自动保存当前状态（含 PandaKing 的行程 + 利润①，但成本① 暂未填）
    await saveVersion(id, {
      itinerary: itinerary.value,
      quote: buildQuote(),
      draft: false,
      notify: false,
      baseVersionId: baseVersionId.value,
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

    // 3) 构造结构化文案（措辞：PandaKing 已拟定初步行程，提交至贵社进行路线优化及报价，并带上具体省地接社机构名）
    const caption = shareH5Caption(data.value ?? undefined)
    const provAg = provincialAgencies.value.find((a) => a.id === collabProvId.value)
    const targetLabel = provAg?.name ? `（${provAg.name}）` : ''
    const text = `${caption}\n\nPandaKing 已拟定初步行程，现提交至贵社${targetLabel}进行路线优化及报价，烦请查收反馈。\n\n👉 查看并回复：${link}`

    // 计算本轮关键变更摘要（面向省地接社：仅成本① + 行程，不含 PandaKing 内部利润①），合并为修改记录，并附到微信文案
    const changes = changesForProvincial.value
    const manual = pkSuggestion.value.trim()
    const autoNote = formatQuoteChanges(changes)
    const combinedNote = manual
      ? (hasProvincialChange.value ? `${autoNote}\n\n【补充说明】${manual}` : manual)
      : (hasProvincialChange.value ? autoNote : '')
    if (combinedNote) {
      try {
        await submitConsoleFeedback(id, combinedNote, user.value?.name || 'PandaKing', 'pandaking')
      } catch {
        /* 变更记录失败不阻断保存 */
      }
    }
    const notifyBody = [text, hasProvincialChange.value ? autoNote : '', manual ? `【补充说明】${manual}` : '']
      .filter(Boolean)
      .join('\n\n')
    dialogText.value = notifyBody

    // 4) 复制交由 NotifyDialog：打开弹窗时尽力自动复制 + 提供「复制（含链接）」按钮兜底
    actionOk.value = '询价链接已生成，请在弹窗内点「复制（含链接）」按钮，去微信粘贴发给省地接社'

    // 5) 弹出文案预览弹窗（已关联省地接社时弹窗尚未打开需在此打开；未关联场景弹窗已开）
    inquireDialog.value = true
    pkSuggestion.value = ''
    await load()
    await loadInquiries()
    }
  } catch (e: any) {
    if (detectStale(e)) { savingNotify.value = false; return }
    actionErr.value = e?.response?.data?.message || '生成询价链接失败'
  } finally {
    savingNotify.value = false
  }
}

function displayName(r: Route): string {
  return safeName(r.customerNameCn, r.customerName)
}

onMounted(() => {
  lastLoadTs = Date.now()
  load()
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibilityChange))
// 把「版本」行程 / 报价映射进本页编辑态 refs（与迭代基线），供控制台版本流与 token 模式 H5 复用
function applyVersion(v?: RouteVersion | null) {
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
}

// token 模式（移动枢纽）加载：凭 pandakingToken 免登录读取 H5 视图，映射进本页编辑态与合成 Route
async function loadTokenMode(tk: string) {
  const h = await fetchH5Route(tk)
  h5.value = h
  // 合成兼容控制台的 Route 对象（缺失字段降级为占位，避免模板读取报错）
  data.value = {
    id: h.routeId,
    customerName: h.customerName || '—',
    customerNameCn: h.customerNameCn || undefined,
    country: '',
    agency: '',
    destination: h.destination,
    groupSize: h.groupSize,
    travelDate: h.travelDate,
    statusKey: (h.statusKey as RouteStatusKey) || 'consulting',
    modeKey: 'collab',
    agencyId: null,
    provincialId: h.provincialId ?? null,
    version: h.version,
    ownerName: h.ownerName ?? null,
    versions: [],
  }
  // H5 已是「最新版本即协作上下文」，直接用其行程 / 报价构造伪版本复用 applyVersion
  applyVersion({
    id: `${h.routeId}:${h.version}`,
    version: h.version,
    draft: false,
    itinerary: h.itinerary as Record<string, unknown>,
    quote: (h.quote as unknown as Quote | null) ?? null,
    createdAt: new Date().toISOString(),
  })
  // 省地接社机构下拉（token 模式由后端直接返回，免 JWT）
  provincialAgencies.value = (h.provincialAgencies ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    role: 'provincial' as Role,
    disabled: false,
    createdAt: '',
  }))
  // 反馈记录（免登录读取），逆序展示
  const list = await fetchH5Feedback(tk)
  feedbackList.value = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  // 状态流转 / 成本询价依赖 JWT，token 模式跳过；对应 tab 在 tokenMode 隐藏
}

async function load() {
  loading.value = true
  err.value = ''
  try {
    if (tokenMode.value && token) {
      tab.value = 'edit'
      await loadTokenMode(token)
    } else {
      await loadProvincialAgencies()
      const r = await fetchRoute(id)
      data.value = r
      const v = pickCurrentVersion(r.versions)
      // 记录乐观锁基准：后续保存会回传此版本 ID，若期间协作方已生成新版本则后端拒绝（409）
      baseVersionId.value = v?.id ?? null
      applyVersion(v)
      await loadFeedback()
      await loadInquiries()
    }
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
    if (tokenMode.value && token) {
      // token 模式：免登录保存编辑（仅保存，不通知任何人）
      await submitH5PandakingEdit(token, { itinerary: itinerary.value, quote: buildQuote() })
      actionOk.value = '草稿已保存'
      await loadTokenMode(token)
    } else {
      await saveVersion(id, {
        itinerary: itinerary.value,
        quote: buildQuote(),
        draft: true,
        notify: false,
        baseVersionId: baseVersionId.value,
      })
      actionOk.value = '草稿已保存'
      await load()
    }
  } catch (e: any) {
    if (detectStale(e)) { savingDraft.value = false; return }
    actionErr.value = e?.response?.data?.message || '保存失败'
  } finally {
    savingDraft.value = false
  }
}

async function onAction(a: { key: string; label: string; needNote?: boolean }) {
  if (a.needNote && !feedbackNote.value.trim()) {
    actionErr.value = '请填写补充说明'
    return
  }
  doing.value = a.key
  actionErr.value = ''
  actionOk.value = ''
  try {
    const note = feedbackNote.value
    // 历史记录：面向 PandaKing 的摘要用对客总价替代利润②，绝不向枢纽暴露境外旅行社利润率
    const historyNote = formatQuoteChanges(currentChangesForPk.value)
    const combinedNote = note.trim()
      ? (hasAnyChange.value ? `${historyNote}\n\n【补充说明】${note.trim()}` : note.trim())
      : (hasAnyChange.value ? historyNote : '')
    const body = a.needNote ? { feedback: combinedNote || note } : undefined
    await routeAction(id, a.key, body)
    feedbackNote.value = ''
    // 除「拒绝/流失」外，所有状态流转（规划提交类动作）与反馈意见，
    // 都生成「主题 + 事件 + H5 链接」通知文案并复制到剪贴板，便于粘贴到微信群同步协作方。
    if (a.key !== 'reject' && data.value) {
      let link = ''
      // 通知文案的变更摘要必须按收件方可见域裁剪，避免向省地接社/旅行社暴露 PandaKing 内部利润①
      // 默认（含 agency→PandaKing 分支）用对客总价替代利润②，不向枢纽暴露利润率
      let notifyChanges: ProvincialChanges = currentChangesForPk.value
      try {
        if (isPk.value) {
          // 回传反馈 / 状态通知 → 带旅行社「可编辑」链接，形成多轮往返闭环
          const s = await ensureAgencyShare(id)
          link = agencyH5Url(s.token)
          notifyChanges = changesForAgency.value
        } else if (isAgency.value) {
          // 旅行社回传反馈 / 状态通知 → 带「可编辑」链接，对称形成多轮往返闭环
          const s = await ensurePandakingShare(id)
          link = pandakingH5Url(s.token)
        } else if (isProv.value) {
          // 断点2 修复：省地接社回传反馈 / 状态通知 → 带「可编辑」链接（原只读链接改为可编辑），
          // 对称形成 PandaKing↔省地接社 多轮往返闭环；成本①/利润①权限隔离不受影响。
          const s = await ensurePandakingShare(id)
          link = pandakingH5Url(s.token)
          notifyChanges = changesForProvincial.value
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
          // detail 仅传人工补充说明，避免与 changes 渲染的【本轮关键变更】重复
          detail: isFeedback ? (note.trim() || undefined) : undefined,
          changes: notifyChanges,
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
   - PandaKing：保存草稿 + 保存并通知（生成面向客户的 H5 链接）
   - 境外旅行社 agency：保存草稿 + 提交建议并通知（保存加价 + 把建议发给，不生成客户链接）
   - 省地接社 provincial：保存草稿 + 保存成本并通知（保存行程/成本说明 + 把建议发给）
   「保存并通知」对非角色 = 一次提交即把工作与建议通知上游，不再额外生成客户 H5 链接。
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
      baseVersionId: baseVersionId.value,
    })
    savedVersion = true
  } catch (e: any) {
    if (detectStale(e)) { savingNotify.value = false; return }
    actionErr.value = e?.response?.data?.message || '保存失败，请重试'
    savingNotify.value = false
    return
  }

  // 2) 提交反馈建议给（允许为空：仅保存工作也可）。合并「本轮变更摘要」一并记录
  const note = consSuggestion.value.trim()
  // 按当前操作方角色选取变更域：旅行社只能改利润②+行程；省地接社只能改成本①+行程
  // 面向 PandaKing 的摘要用对客总价替代利润②（利润② 不得暴露给枢纽）
  const changes = who === 'agency' ? toGuestPriceChanges(changesForAgency.value, quoteABase.value) : changesForProvincial.value
  const hasChange = who === 'agency' ? hasAgencyChange.value : hasProvincialChange.value
  const autoNote = formatQuoteChanges(changes)
  const combinedNote = note
    ? (hasChange ? `${autoNote}\n\n【补充说明】${note}` : note)
    : (hasChange ? autoNote : '')
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
      // 旅行社提交建议并通知 → 带「可编辑」链接，对称形成多轮往返闭环
      const s = await ensurePandakingShare(id)
      link = pandakingH5Url(s.token)
      // 透传省地接社：用同一 route 的 pandaking 令牌提交 source='h5' 反馈，
      // authorRole='pandaking' 使其落入省地接社可见通道（provincial 仅见 authorRole ∈ {provincial, pandaking}）。
      // 前端展示层：content 以「📨」开头时不显身份标签，省地接社只看到协调意见本身。
      // 必须用 submitH5Feedback（source='h5'）——省地接社 H5 页的 getFeedbackByToken 只返回 source='h5' 记录。
      const relayItinerary = formatItineraryChanges(changesForAgency.value)
      const relayBody = [note, relayItinerary].filter(Boolean).join('\n')
      if (relayBody) {
        try {
          await submitH5Feedback(s.token, `📨 旅行社协调意见：\n${relayBody}`, user.value?.name || roleLabel(role.value), 'pandaking')
        } catch {
          /* 透传省地接社失败不阻断主流程 */
        }
      }
    } else {
      // 断点2 修复：省地接社提交成本建议并通知 → 带「可编辑」链接（原只读 shareRoute 改为可编辑），
      // 与旅行社分支对称；成本①/利润①权限隔离不受影响（令牌仅指向该 route 的协作视图）。
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
    // detail 仅传人工补充说明，changes 块会单独渲染【本轮关键变更】
    detail: note || undefined,
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
      d.meals.some((m) => m && m.trim()) ||
      (d.notes && d.notes.trim()),
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
  <div class="detail-v2" :class="{ 'token-hub': tokenMode }">
    <p v-if="loading" class="loading">加载中…</p>
    <p v-else-if="err" class="err">{{ err }}</p>

    <template v-else-if="data">
      <!-- 头部 -->
      <div class="head">
        <div class="left">
          <button v-if="!tokenMode" class="back" :title="route.query.from === 'settings' ? '返回我的路线' : '返回看板'" @click="goBack">‹</button>
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
        <button v-if="!tokenMode" :class="['seg-btn', { on: tab === 'flow' }]" @click="tab = 'flow'">状态与协作</button>
      </div>

      <!-- ============ 行程与报价（两栏）============ -->
      <div v-if="tab === 'edit'" class="cols">
        <!-- 左：行程路线 -->
        <div class="panel">
          <div class="panel-head">
            <h2>行程路线</h2>
            <span class="pill st-neutral sm">共 {{ itinerary.days.length }} 天</span>
          </div>

          <p v-if="!hasItineraryContent && !readonly" class="itinerary-empty">
            该路线暂未规划行程，可直接编辑下方第 1 天，或点「＋ 新增一天」开始排期。
          </p>
          <p v-else-if="!hasItineraryContent && readonly" class="itinerary-empty">
            该路线暂未规划行程
          </p>

          <div v-for="(d, di) in itinerary.days" :key="di" class="day">
            <!-- 只读：直接静态展示 D1-Dn 行程，无展开 / 编辑逻辑 -->
            <template v-if="readonly">
              <div class="day-row ro">
                <div class="day-badge">D{{ d.day }}</div>
                <div class="day-main">
                  <div class="day-title">{{ d.city || ('第 ' + d.day + ' 天') }}</div>
                  <div class="day-sub">
                    <span v-if="d.hotel" class="tag"><b>住宿</b>{{ d.hotel }}</span>
                    <span v-if="d.spots && d.spots.length" class="tag"><b>景点</b>{{ d.spots.join('、') }}</span>
                    <span v-if="d.meals && d.meals.length" class="tag"><b>用餐</b>{{ d.meals.join('、') }}</span>
                    <span v-if="d.notes" class="tag"><b>备注</b>{{ d.notes }}</span>
                  </div>
                </div>
              </div>
            </template>
            <!-- 可编辑：展开 / 收起 + 编辑表单（PandaKing 视角） -->
            <template v-else>
              <div class="day-row" @click="toggleDay(di)">
                <div class="day-badge">D{{ d.day }}</div>
                <div class="day-main">
                  <div class="day-title">{{ d.city || ('第 ' + d.day + ' 天') }}</div>
                  <div class="day-sub">
                    <span v-if="d.hotel" class="tag"><b>住宿</b>{{ d.hotel }}</span>
                    <span class="tag"><b>景点</b>{{ spotCount(d) }} 处</span>
                    <span class="tag"><b>用餐</b>{{ mealCount(d) }} 项</span>
                    <span v-if="d.notes" class="tag"><b>备注</b>{{ d.notes }}</span>
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
                <div class="field full">
                  <label>备注</label>
                  <input v-model="d.notes" placeholder="当天备注（选填）" />
                </div>
                <div class="edit-bar">
                  <button class="del" @click="removeDay(di)">删除当天</button>
                  <button class="ok" @click="toggleDay(di)">收起</button>
                </div>
              </div>
            </template>
          </div>

          <div class="add-day" v-if="!readonly">
            <button class="d-btn dash" @click="addDayOpen">＋ 新增一天</button>
          </div>
        </div>

        <!-- 右：报价明细 -->
        <div class="panel">
          <div class="panel-head">
            <h2>报价明细</h2>
            <span class="pill st-role">报价方 · {{ roleLabel(role) }}</span>
          </div>
          <div v-if="readonly" class="ro-banner">🔒 只读模式：本路线从「系统设置 → 我的路线」打开，仅作概览，不可编辑或提交。</div>

          <div class="panel-body">
            <p v-if="isProv" class="hint">
              省地接社只需填写<b>报价</b>（利润默认 0）；报价保存后即时回填 {{ ownerName }}。左侧行程规划可直接编辑。
            </p>
            <p v-else-if="isAgency" class="hint">
              您看到的「报价A」是 {{ ownerName }} 的报价（即您的成本），在此加上<b>利润</b>即生成对客价。
            </p>
            <QuoteTable v-model:items="quoteItems" v-model:profit2Mode="profit2Mode" v-model:profit2="profit2" :role="role" :read-only="readonly" />
            <p v-if="isPk" class="tip">
              旅行社打开同一页面（角色=旅行社）时，报价A 即为其成本，加利润生成对客价。agency 与 provincial 价格彼此不可见。
            </p>
          </div>

          <!-- ：本轮变更摘要 + 补充说明（可选） -->
          <div v-if="isPk && !readonly" class="pk-extra">
            <div v-if="hasAnyChange" class="ch-summary">
              <h4>📋 本轮变更摘要</h4>
              <pre>{{ formatQuoteChanges(currentChanges) }}</pre>
            </div>
            <div class="suggest">
              <label>补充说明（可选）</label>
              <textarea v-model="pkSuggestion" rows="2" placeholder="如有额外说明可在此补充；变更摘要会自动合并提交"></textarea>
            </div>
          </div>

          <!-- ：省地接社协作三态状态条（分配 / 改派 入口，紧跟协作动作上方） -->
          <div v-if="isPk && !readonly" class="pk-statusbar" :class="provAssigned ? 'assigned' : 'unassigned'">
            <template v-if="!provAssigned">
              <span class="pk-sb-icon">⚠️</span>
              <span class="pk-sb-text">未分配省地接社 · 发起询价前需先分配机构</span>
              <button class="pk-sb-btn" :disabled="loadingProvincialAgencies" @click="openAssignDialog(false)">🏢 分配省地接社</button>
            </template>
            <template v-else>
              <span class="pk-sb-icon">✅</span>
              <span class="pk-sb-text">已分配省地接社：<b>{{ linkedProvName }}</b></span>
              <button class="pk-sb-btn ghost" :disabled="loadingProvincialAgencies" @click="openAssignDialog(true)">🔄 改派</button>
            </template>
          </div>

          <!-- ：发起询价 + 保存并报价（双主操作，弹 NotifyDialog 统一弹结构化文案+URL） -->
          <div v-if="isPk && !readonly" class="pk-actions">
            <button class="d-btn primary block" :disabled="!provAssigned || savingDraft || savingNotify" :title="provAssigned ? '' : '请先在上方状态条分配省地接社'" @click="openInquireDialog">
              🤝 发起询价（{{ inquireTargetLabel }}）
            </button>
            <button class="d-btn primary block" :disabled="savingDraft || savingNotify" @click="openQuoteDialog">
              💼 保存并报价（向旅行社报价）
            </button>
            <button class="d-btn ghost block" :disabled="savingDraft || savingNotify" @click="onSaveDraft">
              {{ savingDraft ? '保存中…' : '💾 仅保存（不通知任何人）' }}
            </button>
          </div>

          <!-- 非：反馈建议输入框（提交给 PandaKing） -->
          <div v-if="(isAgency || isProv) && !readonly" class="suggest">
            <label>补充说明（可选）</label>
            <textarea v-model="consSuggestion" rows="2" :placeholder="isAgency ? ('填写对报价 / 行程的补充说明，将随报价一并通知 ' + ownerName) : ('填写成本补充说明，将通知 ' + ownerName)"></textarea>
          </div>

          <!-- 非：本轮变更摘要（旅行社加价 / 行程调整后实时展示） -->
          <div v-if="isAgency && hasAnyChange && !readonly" class="ch-summary">
            <h4>📋 本轮变更摘要</h4>
            <pre>{{ formatQuoteChanges(currentChanges) }}</pre>
          </div>

          <!-- 非：保存栏（与对称：仅保存 + 提交建议并通知） -->
          <div v-if="!isPk && !readonly" class="savebar">
            <button class="d-btn ghost" :disabled="savingDraft || savingNotify" @click="onSaveDraft">
              {{ savingDraft ? '保存中…' : '仅保存' }}
            </button>
            <button class="d-btn primary" :disabled="savingDraft || savingNotify" @click="onSubmitSuggestion(isAgency ? 'agency' : 'provincial')">
              {{ savingNotify ? '提交中…' : (isAgency ? ('提交建议并通知 ' + ownerName) : ('保存成本并通知 ' + ownerName)) }}
            </button>
          </div>

          <!-- 操作结果：紧邻保存栏，让反馈立即可见 -->
          <div class="action-feedback">
            <div v-if="conflictRefresh" class="conflict-tip">
              <span>⚠️ {{ actionErr }}</span>
              <button class="d-btn mini" :disabled="loading" @click="refreshNow">立即刷新</button>
            </div>
            <p v-if="actionErr && !conflictRefresh" class="err msg">{{ actionErr }}</p>
            <p v-if="actionOk && !inquireDialog && !quoteDialog" class="ok msg">{{ actionOk }}</p>
          </div>

          <div class="note">
            简单逻辑：<span class="formula">报价 = 成本 + 利润</span>。利润可按 <b>金额（元）</b> 或 <b>比例（%）</b> 填写，报价自动计算。
            旅行社沿用同一公式：<span class="formula">对客价 = 本报价(成本) + 利润</span>。
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
          <h3 class="sub-h" v-if="!tokenMode">版本历史</h3>
          <div class="tbl-wrap" v-if="!tokenMode">
            <table class="tbl">
              <thead><tr><th>版本</th><th>草稿</th><th>创建时间</th></tr></thead>
              <tbody>
                <tr v-for="v in data.versions" :key="v.id">
                  <td data-label="版本">{{ v.version }}</td>
                  <td data-label="草稿">{{ v.draft ? '草稿' : '正式' }}</td>
                  <td data-label="创建时间">{{ new Date(v.createdAt).toLocaleString() }}</td>
                </tr>
                <tr v-if="!data.versions?.length"><td colspan="3" class="muted">暂无版本</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- ============ 状态与协作（token 模式依赖 JWT 状态流转，隐藏）============ -->
      <div v-else-if="!tokenMode" class="stack">
        <!-- 状态流转 -->
        <div class="panel solo">
          <div class="panel-head">
            <h2>状态流转</h2>
            <span class="pill" :class="'st-' + data.statusKey">{{ STATUS_LABEL[data.statusKey] }}</span>
          </div>
          <div class="panel-body">
            <p class="hint">状态流转由后端状态机强制校验，非法操作会被拒绝。</p>
            <div class="flow-actions" v-if="!readonly">
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
            <div v-if="availableActions.find((a) => a.needNote) && !readonly" class="field full" style="margin-top: 14px">
            <label>补充说明（可选）</label>
            <textarea v-model="feedbackNote" rows="3" placeholder="填写要回传给对方 / 旅行社的补充说明"></textarea>
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
                  <template v-if="fb.content?.startsWith('📨')">
                    <b>协调意见</b>
                    <span class="fb-time">{{ fmtTime(fb.createdAt) }}</span>
                  </template>
                  <template v-else>
                    <b>{{ fb.authorName || (fb.source === 'h5' ? '协作方' : 'PandaKing') }}</b>
                    <span class="pill xs" :class="fb.authorRole === 'pandaking' ? 'st-role' : (fb.authorRole === 'agency' ? 'st-awaiting_quote' : 'st-confirmed')">
                      {{ fb.authorRole ? roleLabel(fb.authorRole) : (fb.source === 'h5' ? 'H5 链接反馈' : '回传反馈') }}
                    </span>
                    <span class="fb-time">{{ fmtTime(fb.createdAt) }}</span>
                  </template>
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
              <div class="lock-sub">🔒 PandaKing 专享 · 省地接社 / 旅行社 不可查看</div>

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
                  <div class="role">旅行社 成本</div>
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
                        <td data-label="省地接社">{{ provincialAgencies.find((a) => a.id === ci.provincialId)?.name || ci.provincialId }}</td>
                        <td data-label="状态">
                          <span class="pill xs" :class="ci.status === 'submitted' ? 'st-confirmed' : ci.status === 'superseded' ? 'st-superseded' : 'st-awaiting_quote'">
                            {{ ci.status === 'submitted' ? '已回传' : ci.status === 'superseded' ? '已改派' : '待回传' }}
                          </span>
                        </td>
                        <td data-label="成本①">{{ ci.cost1 != null ? yuan(ci.cost1) : '-' }}</td>
                        <td data-label="操作">
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

      <!-- ============ 协作通知弹窗（复用）============ -->
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
            <p v-if="linkedProvName" class="nd-cur">
              当前已关联省地接社：<b>{{ linkedProvName }}</b>
              <span class="nd-cur-tip">（如需改派，请在下方重新选择）</span>
            </p>
            <label>选择 / 更换省地接社机构：</label>
            <select v-model="collabProvId" :class="{ 'nd-select-err': inquireErr }" :disabled="loadingProvincialAgencies">
              <option value="" disabled>{{ loadingProvincialAgencies ? '加载中…' : '请选择' }}</option>
              <option v-for="a in provincialAgencies" :key="a.id" :value="a.id">{{ a.name }}（{{ a.id }}）</option>
            </select>
            <p v-if="inquireErr" class="nd-err">{{ inquireErr }}</p>
          </div>
        </div>
      </NotifyDialog>

      <!-- 分配 / 改派省地接社（独立轻量弹窗：仅改 route.provincialId，不发通知、不生成询价；自管样式，避免 NotifyDialog slot 作用域/片段渲染坑） -->
      <Teleport to="body">
        <div v-if="assignDialog" class="assign-mask" @click.self="assignDialog = false">
          <div class="assign-modal" role="dialog" aria-modal="true">
            <div class="assign-head">
              <span class="assign-title">{{ provAssigned ? '🔄 改派省地接社' : '🏢 分配省地接社' }}</span>
              <button class="assign-close" @click="assignDialog = false" aria-label="关闭">×</button>
            </div>
            <div class="assign-body">
              <p class="assign-sub">
                {{ provAssigned
                  ? ('将本路线的省地接社由「' + linkedProvName + '」更换为其他机构。改派后协作链接将指向新机构。')
                  : '选择承接本路线地接与成本报价的省地接社机构。分配后该机构即可查看并参与协作。' }}
              </p>
              <div v-if="provincialAgencies.length === 0" class="assign-empty">
                暂无省地接社机构，请先在「账号」页新建一个「省地接社」机构。
              </div>
              <div v-else class="assign-pick">
                <label class="assign-label">选择省地接社机构：</label>
                <select
                  v-model="assignProvId"
                  class="assign-select"
                  :class="{ 'assign-select-err': assignErr }"
                  :disabled="loadingProvincialAgencies || assigning"
                >
                  <option value="" disabled>{{ loadingProvincialAgencies ? '加载中…' : '请选择' }}</option>
                  <option v-for="a in provincialAgencies" :key="a.id" :value="a.id">{{ a.name }}（{{ a.id }}）</option>
                </select>
                <p v-if="assignErr" class="assign-err">{{ assignErr }}</p>
              </div>
            </div>
            <div class="assign-actions">
              <button class="btn btn-primary" :disabled="!assignProvId || assigning" @click="confirmAssign">
                {{ assigning ? '处理中…' : '✅ 确定' }}
              </button>
              <button class="btn btn-ghost" @click="assignDialog = false">关闭</button>
            </div>
          </div>
        </div>
      </Teleport>

      <NotifyDialog
        v-model:open="quoteDialog"
        :title="'💼 保存并报价（向旅行社报价）'"
        :subtitle="quoteSubtitle"
        :text="dialogText"
        generate-label="📋 生成报价链接"
        @generate="doQuote"
      >
        <div v-if="!dialogText">
          <div v-if="quoteAgencies.length === 0" class="nd-empty">
            暂无旅行社机构，请先在「账号」页新建一个「旅行社」机构。
          </div>
          <div v-else class="nd-agency-pick">
            <p v-if="linkedAgencyName" class="nd-cur">
              当前已关联旅行社：<b>{{ linkedAgencyName }}</b>
              <span class="nd-cur-tip">（如需改派，请在下方重新选择）</span>
            </p>
            <label>选择 / 更换旅行社机构：</label>
            <select v-model="quoteAgencyId" :class="{ 'nd-select-err': quoteErr }" :disabled="loadingQuoteAgencies">
              <option value="" disabled>{{ loadingQuoteAgencies ? '加载中…' : '请选择' }}</option>
              <option v-for="a in quoteAgencies" :key="a.id" :value="a.id">{{ a.name }}（{{ a.id }}）</option>
            </select>
            <p v-if="quoteErr" class="nd-err">{{ quoteErr }}</p>
          </div>
        </div>
      </NotifyDialog>

      <!-- 移动枢纽吸底操作栏（仅 token 模式 + 移动端显示；桌面隐藏，且移动端隐藏面板内 .pk-actions 避免重复操作） -->
      <div v-if="tokenMode" class="pk-sticky">
        <button class="d-btn primary" :disabled="!provAssigned || savingDraft || savingNotify" :title="provAssigned ? '' : '请先在上方状态条分配省地接社'" @click="openInquireDialog">🤝 发起询价</button>
        <button class="d-btn primary" :disabled="savingDraft || savingNotify" @click="openQuoteDialog">💼 生成对旅行社链接</button>
        <button class="d-btn ghost slim" :disabled="savingDraft || savingNotify" @click="onSaveDraft">💾 仅保存</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ===== 9 色阶设计系统（路线详情 v2 + 协作记录区 v1 高保真）===== */
.detail-v2 {
  --k-card: var(--surface); --k-line: var(--line); --k-ink: var(--ink); --k-muted: var(--muted); --k-bg: var(--bg);
  /* 私有色阶改为全局 token 别名（角色色见 style.css --role-*，状态/中性色见全局语义色） */
  --teal-50: var(--role-pk-50); --teal-200: var(--role-pk-200); --teal-600: var(--role-pk);
  --blue-50: var(--role-provincial-50); --blue-200: var(--role-provincial-200); --blue-600: var(--role-provincial); --blue-800: var(--role-provincial-600);
  --purple-50: var(--role-agency-50); --purple-200: var(--role-agency-200); --purple-600: var(--role-agency); --purple-800: var(--role-agency);
  --amber-50: var(--warn-50); --amber-200: var(--warn); --amber-600: var(--warn); --amber-800: #633806;
  --green-50: var(--ok-50); --green-200: var(--ok); --green-600: var(--ok); --green-800: var(--ok);
  --red-50: var(--danger-50); --red-200: var(--danger); --red-600: var(--danger); --red-800: var(--danger);
  --gray-50: var(--surface-2); --gray-200: var(--line-strong); --gray-800: var(--muted);
  color: var(--ink);
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
.st-neutral { background: var(--surface-2); border-color: var(--line); color: var(--muted); }
.st-role { background: var(--role-agency-50); border-color: var(--role-agency-200); color: var(--role-agency); }
.st-lock { background: var(--role-agency-50); border-color: var(--role-agency-200); color: var(--role-agency); }
.st-consulting { background: var(--brand-50); border-color: var(--brand-100); color: var(--brand-600); }
.st-awaiting_pk_confirm, .st-awaiting_agency_revision { background: var(--warn-50); border-color: #f6d9a8; color: var(--warn); }
.st-awaiting_quote { background: var(--info-50); border-color: #cfe0fc; color: var(--info); }
.st-awaiting_feedback { background: var(--info-50); border-color: #cfe0fc; color: var(--info); }
.st-awaiting_confirm, .st-booked { background: var(--ok-50); border-color: #bfead8; color: var(--ok); }
.st-confirmed { background: var(--ok-50); border-color: #bfead8; color: var(--ok); }
.st-superseded { background: #eceff3; border-color: #cfd6df; color: #6b7785; }
.st-pending_followup { background: var(--warn-50); border-color: #f6d9a8; color: var(--warn); }
.st-lost { background: var(--danger-50); border-color: #f6c9c5; color: var(--danger); }

/* ===== 按钮 ===== */
.d-btn { border-radius: 8px; padding: 9px 15px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; font-family: inherit; }
.d-btn.ghost { background: #fff; border-color: var(--k-line); color: var(--k-ink); }
.d-btn.ghost:hover { background: #fafbfc; }
.d-btn.primary { background: var(--brand); color: #fff; }
.d-btn.primary:hover { background: var(--brand-600); }
.d-btn.danger { background: var(--red-50); border-color: var(--red-200); color: var(--red-600); }
.d-btn.danger:hover { filter: brightness(0.98); }
.d-btn.dash { background: var(--teal-50); color: var(--teal-600); border: 1px dashed var(--teal-200); width: 100%; }
.d-btn.sm { padding: 6px 12px; font-size: 12px; border-radius: 7px; }
.d-btn:disabled { opacity: 0.55; cursor: not-allowed; }

/* ===== 消息条 ===== */
.msg { margin: 8px 0; font-size: 13px; }
.err { color: var(--danger); font-size: 13px; }
.ok { color: var(--ok); font-size: 13px; }
.muted { color: var(--muted); font-size: 13px; }
.link { color: var(--info); text-decoration: none; font-size: 13px; font-weight: 600; }

.fb-notify { margin: 10px 18px; border: 1px solid var(--teal-200); border-radius: 10px; padding: 10px 12px; background: var(--teal-50); }
.fb-notify-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--teal-600); font-weight: 600; }
.fb-notify-head .d-btn { margin-left: auto; }
.fb-notify-text { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6; color: var(--k-ink); font-family: inherit; }

/* ===== 分段切换 ===== */
.seg { display: inline-flex; gap: 4px; background: #eef0f3; border: 1px solid var(--k-line); border-radius: 10px; padding: 4px; margin-bottom: 16px; flex-wrap: wrap; }
.seg-btn { padding: 7px 16px; border: none; background: transparent; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 600; color: var(--k-muted); font-family: inherit; }
.seg-btn.on { background: #fff; color: var(--brand); box-shadow: 0 1px 3px rgba(20,32,51,.1); }

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
.day-row.ro { cursor: default; }
.day-row.ro:hover { background: transparent; }
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
.edit-bar .ok { background: var(--brand); color: #fff; border: none; border-radius: 7px; padding: 6px 14px; font-size: 12px; cursor: pointer; }
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
.nd-cur { margin: 0 0 10px; font-size: 13px; color: var(--k-ink); line-height: 1.5; }
.nd-cur b { color: var(--role-provincial-600, #1f5fbf); }
.nd-cur-tip { color: var(--k-muted); font-size: 12px; }
.nd-agency-pick label { display: block; font-size: 12px; color: var(--k-muted); margin-bottom: 6px; }
.nd-agency-pick select { width: 100%; padding: 10px 12px; border: 1px solid var(--k-line); border-radius: 10px; font-size: 14px; font-family: inherit; background: #fff; }
.nd-empty { padding: 12px 14px; border: 1px dashed var(--k-line); border-radius: 8px; color: var(--k-muted); font-size: 13px; }
.action-feedback { padding: 0 18px 8px; }
.action-feedback .msg { margin: 0 0 6px; }
.conflict-tip { display: flex; align-items: center; gap: 10px; background: #fff4e5; border: 1px solid #ffb74d; border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; font-size: 12px; color: #8a5300; line-height: 1.5; }
.conflict-tip .d-btn.mini { flex: 0 0 auto; padding: 4px 12px; font-size: 12px; border-radius: 6px; background: var(--brand); color: #fff; border: none; cursor: pointer; }
.conflict-tip .d-btn.mini:disabled { opacity: .6; cursor: not-allowed; }
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
@media (max-width: 860px) {
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

/* 移动端：内部数据表转卡片（统一断点 ≤640，含成本明细跨列行特殊处理） */
@media (max-width: 640px) {
  .tbl-wrap { overflow: visible; }
  .tbl {
    display: block; min-width: 0; width: 100%;
    background: transparent; border: none; border-radius: 0; overflow: visible;
  }
  .tbl thead { display: none; }
  .tbl tbody { display: block; }
  .tbl tbody tr:not(.detail-row) {
    display: block; background: var(--card); border: 1px solid var(--line);
    border-radius: var(--r-md); padding: 4px 14px; margin-bottom: 12px;
  }
  .tbl tbody tr:not(.detail-row):hover { background: var(--card); }
  .tbl td {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 9px 0; border-bottom: 1px solid var(--k-line); text-align: right; font-size: 13px;
  }
  .tbl td:last-child { border-bottom: none; }
  .tbl td::before {
    content: attr(data-label); color: var(--muted); font-size: 12px; font-weight: 600;
    text-align: left; flex: none;
  }
  .tbl td.ops { flex-wrap: wrap; }
  .tbl td.ops::before { flex: 1 0 100%; margin-bottom: 6px; }
  .tbl td[colspan]::before { display: none; }
  .tbl td[colspan] { justify-content: center; text-align: center; }
  /* 成本明细跨列行：整行作为子卡展示，不套用字段标签 */
  .tbl tr.detail-row { display: block; margin: 0 0 12px; }
  .tbl tr.detail-row td {
    display: block; text-align: left; padding: 10px 12px;
    background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--r-sm);
  }
  .tbl tr.detail-row td::before { display: none; }
}

/* ===== 移动枢纽吸底操作栏（token 模式移动端专用；桌面与控制台均隐藏）===== */
.pk-sticky { display: none; }
@media (max-width: 640px) {
  /* 移动端以吸底栏替代面板内操作区，避免两处重复操作 */
  .token-hub .pk-actions { display: none; }
  .pk-sticky {
    display: flex;
    gap: 8px;
    position: fixed;
    left: 0; right: 0; bottom: 0;
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
    background: var(--surface);
    border-top: 1px solid var(--k-line);
    box-shadow: 0 -3px 12px rgba(20, 32, 51, 0.08);
    z-index: 60;
  }
  .pk-sticky .d-btn { flex: 1; min-width: 0; }
  .pk-sticky .d-btn.slim { flex: 0 0 auto; }
  /* 给吸底栏留白，避免遮挡底部内容 */
  .token-hub { padding-bottom: 84px; }
}

/* ===== 省地接社协作三态状态条（）===== */
.pk-statusbar {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 14px; border-radius: var(--r-md, 10px); margin-bottom: 14px;
  font-size: 14px; border: 1px solid transparent; line-height: 1.5;
}
.pk-statusbar.unassigned {
  background: var(--warn-50, #fff7ed); border-color: var(--warn, #f59e0b); color: #7a4d05;
}
.pk-statusbar.assigned {
  background: var(--ok-50, #ecfdf5); border-color: var(--ok, #10b981); color: #065f46;
}
.pk-sb-icon { font-size: 16px; line-height: 1; }
.pk-sb-text { flex: 1; min-width: 0; }
.pk-sb-text b { font-weight: 700; }
.pk-sb-btn {
  border: 1px solid var(--brand, #0ea5a4); background: var(--brand, #0ea5a4); color: #fff;
  border-radius: var(--r-sm, 8px); padding: 7px 12px; font-size: 13px; cursor: pointer; white-space: nowrap;
}
.pk-sb-btn:hover { opacity: 0.88; }
.pk-sb-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pk-sb-btn.ghost {
  background: #fff; color: var(--brand, #0ea5a4); border-color: var(--brand, #0ea5a4);
}
/* 弹窗内下拉报错（slot 内容，归本组件 scope，确保覆盖生效） */
.nd-select-err { border-color: var(--danger, #ef4444) !important; }
.nd-err { color: var(--danger, #ef4444); font-size: 13px; margin: 6px 0 0; }

/* ===== 分配 / 改派省地接社 自管轻量弹窗（脱离 NotifyDialog slot，自渲染必现）===== */
.assign-mask {
  position: fixed; inset: 0;
  background: rgba(18, 26, 41, 0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999; padding: 16px;
}
.assign-modal {
  background: var(--surface); border-radius: var(--r-lg, 14px);
  width: 100%; max-width: 460px; max-height: 92vh; overflow: auto;
  box-shadow: var(--sh-lg, 0 12px 32px rgba(0,0,0,0.18));
  font-family: -apple-system, 'PingFang SC', sans-serif;
  color: var(--ink, #1c2430);
}
.assign-head {
  display: flex; align-items: center; gap: 8px;
  padding: 14px 18px; border-bottom: 1px solid var(--line, #e8edf4);
}
.assign-title { font-size: 16px; font-weight: 700; flex: 1; color: var(--ink, #1c2430); }
.assign-close {
  background: transparent; border: none; font-size: 22px; line-height: 1;
  color: var(--muted, #76819a); cursor: pointer; padding: 0 6px;
}
.assign-close:hover { color: var(--ink, #1c2430); }
.assign-body { padding: 14px 18px 4px; }
.assign-sub {
  color: var(--muted, #76819a); font-size: 13px; margin: 0 0 14px; line-height: 1.6;
}
.assign-empty {
  padding: 18px 14px; background: var(--surface-2, #f5f7fa);
  border-radius: var(--r-sm, 8px); color: var(--muted, #76819a);
  font-size: 13px; text-align: center;
}
.assign-pick { display: flex; flex-direction: column; gap: 6px; }
.assign-label { font-size: 13px; color: var(--ink, #1c2430); font-weight: 500; }
.assign-select {
  width: 100%; padding: 9px 12px;
  border: 1px solid var(--line, #e8edf4); border-radius: var(--r-sm, 8px);
  font-size: 14px; background: #fff; color: var(--ink, #1c2430);
  cursor: pointer; outline: none; transition: border-color 0.15s;
  appearance: auto;
}
.assign-select:focus { border-color: var(--brand, #0ea5a4); }
.assign-select:disabled { opacity: 0.6; cursor: not-allowed; }
.assign-select-err { border-color: var(--danger, #ef4444) !important; }
.assign-err { color: var(--danger, #ef4444); font-size: 13px; margin: 6px 0 0; }
.assign-actions {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 12px 18px 18px;
}
</style>
