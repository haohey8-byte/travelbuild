<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { fetchRoute, saveVersion, shareRoute, routeAction } from '@/api/routes'
import { useAuthStore } from '@/stores/auth'
import { safeName, safeText } from '@/utils/name'
import { shareH5Url, shareH5Caption } from '@/utils/share'
import type { Route, RouteStatusKey, QuoteLevel } from '@/types'

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
const savingDraft = ref(false)
const savingNotify = ref(false)
const doing = ref('')
const shareLink = ref('')

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

const versionLabel = computed(() => data.value?.versions?.[0]?.version ?? 'v1')

function displayName(r: Route): string {
  return safeName(r.customerNameCn, r.customerName)
}

onMounted(load)
async function load() {
  loading.value = true
  err.value = ''
  try {
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
  } catch (e: any) {
    err.value = e?.response?.data?.message || '加载失败'
  } finally {
    loading.value = false
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
  try {
    const res = await saveVersion(id, {
      itinerary: itinerary.value,
      quote: buildQuote(),
      draft: false,
      notify: true,
    })
    // 后端返回 /share/route/TOKEN；分享页由后端服务端渲染（带 OG 注入），需用后端域名
    const link = res.token ? shareH5Url(res.token) : ''
    shareLink.value = link
    if (link && data.value) {
      const caption = shareH5Caption(data.value)
      try {
        await navigator.clipboard.writeText(`${caption}\n${link}`)
      } catch {
        /* 忽略剪贴板异常 */
      }
    }
    await load()
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
    const body = a.needNote ? { feedback: feedbackNote.value } : undefined
    await routeAction(id, a.key, body)
    feedbackNote.value = ''
    await load()
  } catch (e: any) {
    actionErr.value = e?.response?.data?.message || `${a.label}失败（可能状态不允许）`
  } finally {
    doing.value = ''
  }
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
        <a v-if="shareLink" :href="shareLink" target="_blank" class="link">打开协作 H5 ↗（已复制）</a>
      </div>
      <p v-if="actionErr" class="err">{{ actionErr }}</p>

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
                <td><input type="number" v-model.number="it.markup" :disabled="!canEditCost" /></td>
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
    </template>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.sub { font-size: 14px; color: var(--muted); margin-left: 10px; font-weight: 400; }
.actions { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.link { color: var(--info); text-decoration: none; font-size: 14px; }
.err { color: var(--danger); }
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
