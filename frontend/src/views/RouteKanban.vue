<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRouteStore } from '@/stores/route'
import { useAuthStore } from '@/stores/auth'
import { createRoute, deleteRoute } from '@/api/routes'
import { fetchAgencies } from '@/api/auth'
import { safeName, safeText } from '@/utils/name'
import type { Route, RouteStatusKey, Agency } from '@/types'

async function retry<T>(fn: () => Promise<T>, retries = 3, baseDelay = 2000): Promise<T> {
  let lastErr: any
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      lastErr = e
      const status = e?.response?.status
      if (status >= 400 && status < 500) throw e
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, baseDelay * (i + 1)))
      }
    }
  }
  throw lastErr
}

const router = useRouter()
const store = useRouteStore()
const auth = useAuthStore()
const { routes, loading, error: routeError } = storeToRefs(store)
const { user } = storeToRefs(auth)

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
const STATUSES = Object.keys(STATUS_LABEL) as RouteStatusKey[]

function displayName(r: Route): string {
  return safeName(r.customerNameCn, r.customerName)
}

// —— 统计卡（活跃客户 / 待报价 / 待跟进 / 本月成单）——
const stats = computed(() => {
  const m: Record<string, number> = { all: routes.value.length }
  for (const s of STATUSES) m[s] = 0
  for (const r of routes.value) m[r.statusKey] = (m[r.statusKey] ?? 0) + 1
  return m
})
const activeCount = computed(
  () => routes.value.filter((r) => r.statusKey !== 'booked' && r.statusKey !== 'lost').length,
)

// —— 筛选栏 ——
const filterStatus = ref<'all' | RouteStatusKey>('all')
const filterAgency = ref<string>('all')
const filterDest = ref<string>('all')
const keyword = ref('') // 已应用的搜索词（filtered 使用）
const searchInput = ref('') // 输入框绑定值（点击「搜索」/回车才应用）
function applySearch() {
  keyword.value = searchInput.value.trim()
}
function clearSearch() {
  searchInput.value = ''
  keyword.value = ''
}

// 可选项：从现有路线动态汇总
const agencyOptions = computed(() => {
  const set = new Set<string>()
  for (const r of routes.value) {
    const a = safeText(r.agency)
    if (a) set.add(a)
  }
  return [...set].sort()
})
const destOptions = computed(() => {
  const set = new Set<string>()
  for (const r of routes.value) {
    const d = safeText(r.destination)
    if (d) set.add(d)
  }
  return [...set].sort()
})

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return routes.value.filter((r) => {
    if (filterStatus.value !== 'all' && r.statusKey !== filterStatus.value) return false
    if (filterAgency.value !== 'all' && safeText(r.agency) !== filterAgency.value) return false
    if (filterDest.value !== 'all' && safeText(r.destination) !== filterDest.value) return false
    if (kw) {
      const hay = `${displayName(r)} ${safeText(r.destination)} ${safeText(r.agency)}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

// —— 待办提醒（从真实路线状态派生）——
interface Todo {
  id: string
  bar: 'red' | 'amber' | 'blue'
  html: string
  action: string
  route: Route
}
const todos = computed<Todo[]>(() => {
  const list: Todo[] = []
  for (const r of routes.value) {
    const who = displayName(r)
    if (r.statusKey === 'pending_followup') {
      list.push({ id: r.id, bar: 'red', html: `<b>${who}</b> 需要跟进，已超出预期回复时间`, action: '跟进提醒', route: r })
    } else if (r.statusKey === 'awaiting_feedback') {
      list.push({ id: r.id, bar: 'red', html: `<b>${who}</b> 的报价已发出，等待旅行社反馈`, action: '跟进提醒', route: r })
    } else if (r.statusKey === 'awaiting_quote' && r.provincialId) {
      list.push({ id: r.id, bar: 'amber', html: `<b>${who}</b> 已分配给省地接社，等待成本价回填`, action: '催办', route: r })
    } else if (r.statusKey === 'awaiting_quote') {
      list.push({ id: r.id, bar: 'blue', html: `<b>${who}</b> 待报价，请尽快完成行程与报价`, action: '去报价', route: r })
    } else if (r.statusKey === 'awaiting_pk_confirm') {
      list.push({ id: r.id, bar: 'amber', html: `<b>${who}</b> 旅行社已提交草案，等待确认`, action: '去确认', route: r })
    }
  }
  return list.slice(0, 5)
})

// —— 头像（首字母 + 稳定色）——
const AVATARS = [
  { bg: '#85B7EB', fg: '#fff' },
  { bg: '#AFA9EC', fg: '#fff' },
  { bg: '#FAC775', fg: '#633806' },
  { bg: '#97C459', fg: '#fff' },
  { bg: '#5DCAA5', fg: '#fff' },
  { bg: '#F09595', fg: '#7A1F1F' },
  { bg: '#F0997B', fg: '#712B13' },
]
function avatarOf(r: Route) {
  const name = displayName(r) || '客'
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const a = AVATARS[h % AVATARS.length]
  // 英文名取首字母大写，中文名取首字
  const ch = /[a-zA-Z]/.test(name[0]) ? name[0].toUpperCase() : name[0]
  return { ...a, ch }
}
function metaOf(r: Route): string {
  const parts: string[] = []
  if (r.country) parts.push(safeText(r.country) || r.country)
  if (r.groupSize) parts.push(`${r.groupSize}人`)
  if (r.travelDate) {
    try {
      const d = new Date(r.travelDate)
      parts.push(`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    } catch {
      /* ignore */
    }
  }
  return parts.join(' · ')
}

// 机构列表（一手创建路线时用于选择境外旅行社）
const agencies = ref<Agency[]>([])
const loadingAgencies = ref(false)
const agencyError = ref<string | null>(null)
async function loadAgencies() {
  if (user.value?.role !== 'pandaking') return
  loadingAgencies.value = true
  agencyError.value = null
  try {
    agencies.value = await retry(fetchAgencies)
  } catch (e: any) {
    agencyError.value = e?.response?.data?.message || e?.message || '机构加载失败'
    agencies.value = []
    console.error('加载机构列表失败:', e)
  } finally {
    loadingAgencies.value = false
  }
}

onMounted(() => {
  // 串行预热：先等后端容器唤醒，再加载数据，避免并发请求全部撞冷启动超时
  store.load().then(() => loadAgencies())
})

// 操作指引浮层：首次访问自动弹出，关闭后写入 localStorage 不再打扰；右下角 ? 可随时重看
const GUIDE_KEY = 'pk_guide_dismissed'
const showGuide = ref(localStorage.getItem(GUIDE_KEY) !== '1')
function dismissGuide() {
  showGuide.value = false
  localStorage.setItem(GUIDE_KEY, '1')
}
function openGuide() {
  showGuide.value = true
}

function open(r: Route) {
  router.push(`/routes/${r.id}`)
}

// 创建路线弹窗
const showCreate = ref(false)
const creating = ref(false)
const createErr = ref('')
const form = ref({
  customerName: '',
  customerNameCn: '',
  destination: '',
  country: 'China',
  agency: '',
  agencyId: '',
  groupSize: 1,
  travelDate: '',
  modeKey: 'collab' as 'collab' | 'solo',
})

async function onCreate() {
  createErr.value = ''
  if (!form.value.customerName.trim() || !form.value.destination.trim()) {
    createErr.value = '请填写客户名（英文）和目的地'
    return
  }
  if (user.value?.role === 'pandaking' && !form.value.agencyId.trim()) {
    createErr.value = 'PandaKing 创建路线必须选择境外旅行社'
    return
  }
  creating.value = true
  try {
    const payload: any = {
      customerName: form.value.customerName.trim(),
      customerNameCn: form.value.customerNameCn.trim() || undefined,
      destination: form.value.destination.trim(),
      country: form.value.country.trim() || 'China',
      agency: form.value.agency.trim(),
      groupSize: Number(form.value.groupSize) || 1,
      travelDate: form.value.travelDate || undefined,
      modeKey: form.value.modeKey,
    }
    // 一手必须传 agencyId；旅行社不传，后端自动取本机构
    if (user.value?.role === 'pandaking') {
      payload.agencyId = form.value.agencyId.trim()
    }
    await createRoute(payload)
    showCreate.value = false
    form.value = {
      customerName: '',
      customerNameCn: '',
      destination: '',
      country: 'China',
      agency: '',
      agencyId: '',
      groupSize: 1,
      travelDate: '',
      modeKey: 'collab',
    }
    await store.load()
  } catch (e: any) {
    console.error('创建路线失败:', e)
    createErr.value = e?.response?.data?.message || e?.message || '创建失败，请检查网络或刷新后重试'
  } finally {
    creating.value = false
  }
}

// 一手删除路线（删除前后端归档快照到 RouteArchive 备份历史库）
const isPandaking = computed(() => user.value?.role === 'pandaking')
const pendingDelete = ref<Route | null>(null)
const deleting = ref(false)
function askDelete(r: Route, e: Event) {
  e.stopPropagation() // 避免触发行跳转详情
  pendingDelete.value = r
}
async function confirmDelete() {
  if (!pendingDelete.value) return
  deleting.value = true
  try {
    await deleteRoute(pendingDelete.value.id)
    pendingDelete.value = null
    await store.load()
  } catch (e: any) {
    console.error('删除路线失败:', e)
    alert(e?.response?.data?.message || e?.message || '删除失败，请重试')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <div v-if="user?.role === 'provincial'" class="forbidden">
    <h2>⛔ 无权限访问</h2>
    <p>按系统权限设计，省地接社不进入控制台路线视图。</p>
    <p>你的协作入口：账号页 →「我的询价」，或通过 PandaKing 发来的 H5 链接填写报价。</p>
  </div>

  <div v-else class="kanban-v2">
    <!-- 顶栏 -->
    <div class="topbar">
      <div>
        <h1>客户看板</h1>
        <div class="sub">管理所有境外游客的定制行程与报价</div>
      </div>
      <div class="actions">
        <button v-if="isPandaking" class="k-btn ghost" @click="router.push('/route-archives')">归档历史</button>
        <button class="k-btn primary" @click="showCreate = true">+ 新建路线</button>
      </div>
    </div>

    <!-- 统计卡 -->
    <div class="stats">
      <div class="stat"><div class="label">活跃客户</div><div class="num">{{ activeCount }}</div></div>
      <div class="stat amber"><div class="label">待报价</div><div class="num">{{ stats.awaiting_quote }}</div></div>
      <div class="stat red"><div class="label">待跟进</div><div class="num">{{ stats.pending_followup }}</div></div>
      <div class="stat green"><div class="label">本月成单</div><div class="num">{{ stats.booked }}</div></div>
    </div>

    <!-- 筛选栏 -->
    <div class="filterbar">
      <select class="select" v-model="filterStatus">
        <option value="all">全部状态</option>
        <option v-for="s in STATUSES" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
      </select>
      <select class="select" v-model="filterAgency">
        <option value="all">全部旅行社</option>
        <option v-for="a in agencyOptions" :key="a" :value="a">{{ a }}</option>
      </select>
      <select class="select" v-model="filterDest">
        <option value="all">全部目的地</option>
        <option v-for="d in destOptions" :key="d" :value="d">{{ d }}</option>
      </select>
      <div class="search">
        <input v-model="searchInput" @keydown.enter="applySearch" placeholder="搜索客户名 / 目的地 / 旅行社…" />
        <button v-if="searchInput" class="k-btn ghost sm" type="button" @click="clearSearch" title="清除搜索">×</button>
        <button class="k-btn primary" type="button" @click="applySearch">搜索</button>
      </div>
    </div>

    <!-- 加载/错误提示 -->
    <div v-if="loading" class="empty">加载中…</div>
    <div v-else-if="routeError" class="empty err">
      <div>数据加载失败：{{ routeError }}</div>
      <button class="k-btn primary sm" @click="store.load()">重新加载</button>
    </div>

    <!-- 表格 -->
    <div v-else class="table" :class="{ 'has-op': isPandaking }">
      <div class="thead">
        <div>客户</div><div>旅行社</div><div>目的地</div><div>行程模式</div><div>状态</div>
        <div v-if="isPandaking" class="col-op"></div>
      </div>
      <div v-for="r in filtered" :key="r.id" class="trow" @click="open(r)">
        <div class="cust">
          <div class="avatar" :style="{ background: avatarOf(r).bg, color: avatarOf(r).fg }">{{ avatarOf(r).ch }}</div>
          <div>
            <div class="name">{{ displayName(r) }}</div>
            <div class="meta">{{ metaOf(r) || '—' }}</div>
          </div>
        </div>
        <div>{{ safeText(r.agency) || '—' }}</div>
        <div class="dest">
          <div class="main">{{ safeText(r.destination) || '未填目的地' }}</div>
        </div>
        <div>
          <span class="pill" :class="r.modeKey === 'collab' ? 'mode-collab' : 'mode-solo'">
            {{ r.modeKey === 'collab' ? '协作' : '自行' }}
          </span>
        </div>
        <div><span class="pill" :class="'st-' + r.statusKey">{{ STATUS_LABEL[r.statusKey] }}</span></div>
        <div v-if="isPandaking" class="col-op">
          <button class="row-del" title="删除路线（自动归档备份）" @click="askDelete(r, $event)">🗑</button>
        </div>
      </div>
      <div v-if="!filtered.length" class="empty">
        {{ routes.length ? '没有符合筛选条件的路线' : '暂无路线，点击右上角「+ 新建路线」开始' }}
      </div>
    </div>

    <!-- 待办提醒 -->
    <div class="todo">
      <h2>待办提醒</h2>
      <template v-if="todos.length">
        <div v-for="t in todos" :key="t.id" class="todo-item">
          <div class="todo-bar" :class="'bar-' + t.bar"></div>
          <div class="todo-text" v-html="t.html"></div>
          <button class="k-btn ghost sm" @click="open(t.route)">{{ t.action }}</button>
        </div>
      </template>
      <p v-else class="todo-empty">暂无待办，所有路线进展正常 ✅</p>
    </div>

    <!-- 创建路线弹窗 -->
    <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
      <div class="modal">
        <form @submit.prevent="onCreate">
          <h2>创建新路线</h2>
          <label>
            <span>客户名（英文）*</span>
            <input v-model="form.customerName" type="text" placeholder="Smith Family" autocomplete="off" />
          </label>
          <label>
            <span>客户中文名</span>
            <input v-model="form.customerNameCn" type="text" placeholder="史密斯一家" autocomplete="off" />
          </label>
          <label>
            <span>目的地 *</span>
            <input v-model="form.destination" type="text" placeholder="成都·九寨" autocomplete="off" />
          </label>
          <label>
            <span>国家</span>
            <input v-model="form.country" type="text" placeholder="China" autocomplete="off" />
          </label>
          <label v-if="user?.role === 'pandaking'">
            <span>境外旅行社 *</span>
            <select v-model="form.agencyId" :disabled="loadingAgencies">
              <option value="" disabled>{{ loadingAgencies ? '加载中…' : agencyError ? '机构加载失败' : '请选择境外旅行社' }}</option>
              <option v-for="a in agencies.filter(x => x.role === 'agency' && !x.disabled)" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
            <small v-if="agencyError" class="err-hint">{{ agencyError }} <a href="#" @click.prevent="loadAgencies()">重试</a></small>
          </label>
          <label v-else-if="user?.role === 'agency'">
            <span>所属机构</span>
            <input :value="user?.agencyId || ''" type="text" disabled />
          </label>
          <label>
            <span>人数</span>
            <input v-model.number="form.groupSize" type="number" min="1" />
          </label>
          <label>
            <span>出行日期</span>
            <input v-model="form.travelDate" type="date" />
          </label>
          <label>
            <span>模式</span>
            <select v-model="form.modeKey">
              <option value="collab">协作（旅行社发起草案）</option>
              <option value="solo">自营（PandaKing 直接报价）</option>
            </select>
          </label>
          <p v-if="createErr" class="err">{{ createErr }}</p>
          <div class="modal-actions">
            <button type="button" class="btn" :disabled="creating" @click="showCreate = false">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="creating">{{ creating ? '创建中...' : '创建' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 删除确认浮层（仅一手可见触发） -->
    <div v-if="pendingDelete" class="modal-backdrop" @click.self="pendingDelete = null">
      <div class="modal">
        <h2>确认删除路线？</h2>
        <p class="muted">
          将删除「{{ displayName(pendingDelete) }}」及其所有版本、共享链接与反馈。
        </p>
        <p class="muted">
          删除前系统会自动归档整条路线快照到<b>备份历史库</b>，可审计与溯源，无需担心数据丢失。
        </p>
        <div class="modal-actions">
          <button type="button" class="btn" :disabled="deleting" @click="pendingDelete = null">取消</button>
          <button type="button" class="btn btn-danger" :disabled="deleting" @click="confirmDelete">
            {{ deleting ? '删除中...' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 操作指引浮层 -->
    <div
      v-if="showGuide"
      class="modal-backdrop"
      @click.self="dismissGuide"
      role="dialog"
      aria-modal="true"
      aria-label="操作指引"
    >
      <div class="modal guide" @keydown.esc="dismissGuide">
        <button class="guide-close" @click="dismissGuide" aria-label="关闭指引">×</button>
        <h2>👋 欢迎使用协作工作台</h2>
        <p class="guide-sub">三步，把一份路线做成可发给客户的 H5：</p>
        <ol class="guide-steps">
          <li>
            <b>创建路线</b><br />
            点右上角「+ 新建路线」，填客户英文名、目的地，<b>旅行社为必填项</b>。
          </li>
          <li>
            <b>编辑行程与报价</b><br />
            进入详情页，按天排城市 / 景点 / 住宿 / 餐饮；右侧报价填成本 + 利润，自动算出<b>对客总价</b>。
          </li>
          <li>
            <b>保存并通知</b><br />
            点「保存并通知」生成 H5 协作链接，复制发给客户。客户打开即看到目的地、状态、对客价。
          </li>
        </ol>
        <p class="guide-tip">
          💡 一个账号固定一个角色。如需以其他角色查看，请退出后用对应账号登录。H5 链接建议用<b>无痕窗口或手机</b>打开（模拟客户视角）。
        </p>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="dismissGuide">开始使用</button>
        </div>
      </div>
    </div>

    <!-- 帮助按钮：随时重看操作指引 -->
    <button class="help-fab" @click="openGuide" aria-label="查看操作指引" title="操作指引">?</button>
  </div>
</template>

<style scoped>
/* ===== 9 色阶设计系统（客户看板 v2 高保真，来自 doc/03 §10）===== */
.kanban-v2 {
  --k-card: #ffffff; --k-line: #e6e8eb; --k-ink: #1f2329; --k-muted: #8a9099; --k-bg: #f4f5f7;
  --teal-50:#e6f7f1; --teal-200:#5dcaa5; --teal-600:#0f6e56;
  --blue-50:#eaf4fc; --blue-200:#85b7eb; --blue-800:#0e3f73;
  --purple-50:#f1effc; --purple-200:#afa9ec; --purple-800:#3a338a;
  --amber-50:#fef6e7; --amber-200:#fac775; --amber-600:#c8881a; --amber-800:#633806;
  --green-50:#f1f8e8; --green-200:#97c459; --green-600:#3b6d11; --green-800:#27490b;
  --red-50:#fcebeb; --red-200:#f09595; --red-600:#a32d2d; --red-800:#7a1f1f;
  --gray-50:#f4f4f2; --gray-200:#b4b2a9; --gray-800:#444441;
  color: var(--k-ink);
}

/* 顶栏 */
.topbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
.topbar h1 { font-size: 24px; font-weight: 700; letter-spacing: .5px; margin: 0; }
.topbar .sub { color: var(--k-muted); font-size: 13px; margin-top: 4px; }
.topbar .actions { display: flex; gap: 10px; }
.k-btn { border-radius: 8px; padding: 9px 16px; font-size: 14px; font-weight: 600; cursor: pointer; border: 1px solid transparent; font-family: inherit; }
.k-btn.ghost { background: #fff; border-color: var(--k-line); color: var(--k-ink); }
.k-btn.ghost:hover { background: #fafbfc; }
.k-btn.primary { background: var(--teal-600); color: #fff; }
.k-btn.primary:hover { filter: brightness(1.06); }
.k-btn.sm { font-size: 12px; padding: 6px 12px; border-radius: 7px; }

/* 统计卡 */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 18px; }
.stat { background: var(--k-card); border: 1px solid var(--k-line); border-radius: 12px; padding: 16px 18px; position: relative; overflow: hidden; }
.stat::before { content: ""; position: absolute; left: 0; top: 0; right: 0; height: 4px; background: var(--gray-200); }
.stat.amber::before { background: var(--amber-200); }
.stat.red::before { background: var(--red-200); }
.stat.green::before { background: var(--green-200); }
.stat .label { font-size: 13px; color: var(--k-muted); }
.stat .num { font-size: 30px; font-weight: 800; margin-top: 8px; }
.stat.amber .num { color: var(--amber-600); }
.stat.red .num { color: var(--red-600); }
.stat.green .num { color: var(--green-600); }

/* 筛选栏 */
.filterbar { display: flex; gap: 10px; align-items: center; background: var(--k-card); border: 1px solid var(--k-line); border-radius: 12px; padding: 12px 14px; margin-bottom: 14px; flex-wrap: wrap; }
.filterbar .select { appearance: none; background: var(--k-bg); border: 1px solid var(--k-line); border-radius: 8px; padding: 8px 30px 8px 12px; font-size: 13px; color: var(--k-ink); cursor: pointer;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'><path d='M3 4.5L6 7.5L9 4.5' stroke='%238A9099' stroke-width='1.5' fill='none'/></svg>");
  background-repeat: no-repeat; background-position: right 10px center; }
.filterbar .search { flex: 1; min-width: 200px; display: flex; gap: 8px; }
.filterbar .search input { flex: 1; background: var(--k-bg); border: 1px solid var(--k-line); border-radius: 8px; padding: 8px 12px; font-size: 13px; }
.filterbar .search .k-btn { padding: 8px 16px; }

/* 表格 */
.table { background: var(--k-card); border: 1px solid var(--k-line); border-radius: 12px; overflow: hidden; }
.thead, .trow { display: grid; grid-template-columns: 2.4fr 1.2fr 1.6fr 1fr 1.1fr; }
.table.has-op .thead, .table.has-op .trow { grid-template-columns: 2.4fr 1.2fr 1.6fr 1fr 1.1fr 44px; }
.thead { background: #fbfbfc; border-bottom: 1px solid var(--k-line); font-size: 12px; color: var(--k-muted); font-weight: 600; }
.thead > div { padding: 12px 16px; }
.trow { border-bottom: 1px solid var(--k-line); align-items: center; cursor: pointer; transition: background .15s; }
.trow:last-child { border-bottom: none; }
.trow:hover { background: #fafbfc; }
.trow > div { padding: 12px 16px; font-size: 13px; }
.cust { display: flex; align-items: center; gap: 12px; }
.avatar { width: 38px; height: 38px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
.cust .name { font-weight: 600; font-size: 14px; }
.cust .meta { color: var(--k-muted); font-size: 12px; margin-top: 2px; }
.dest .main { font-weight: 600; }
.col-op { display: flex; align-items: center; justify-content: center; padding: 0 !important; }
.row-del { width: 28px; height: 28px; border: none; border-radius: 8px; background: transparent; color: var(--k-muted); font-size: 14px; cursor: pointer; line-height: 1; opacity: 0; transition: opacity .15s, background .15s; }
.trow:hover .row-del { opacity: 1; }
.row-del:hover { background: var(--red-50); color: var(--red-600); }

/* 标签 pill */
.pill { display: inline-flex; align-items: center; padding: 4px 11px; border-radius: 999px; font-size: 12px; font-weight: 600; border: 1px solid transparent; white-space: nowrap; }
.mode-solo { background: var(--blue-50); border-color: var(--blue-200); color: var(--blue-800); }
.mode-collab { background: var(--purple-50); border-color: var(--purple-200); color: var(--purple-800); }
.st-consulting { background: var(--gray-50); border-color: var(--gray-200); color: var(--gray-800); }
.st-awaiting_pk_confirm, .st-awaiting_agency_revision { background: var(--amber-50); border-color: var(--amber-200); color: var(--amber-800); }
.st-awaiting_quote { background: var(--blue-50); border-color: var(--blue-200); color: var(--blue-800); }
.st-awaiting_feedback { background: var(--purple-50); border-color: var(--purple-200); color: var(--purple-800); }
.st-awaiting_confirm, .st-booked { background: var(--teal-50); border-color: var(--teal-200); color: var(--teal-600); }
.st-confirmed { background: var(--green-50); border-color: var(--green-200); color: var(--green-800); }
.st-pending_followup { background: var(--red-50); border-color: var(--red-200); color: var(--red-800); }
.st-lost { background: var(--gray-50); border-color: var(--gray-200); color: var(--gray-800); }

.empty { padding: 40px 16px; text-align: center; color: var(--k-muted); font-size: 14px; background: var(--k-card); border: 1px solid var(--k-line); border-radius: 12px; }
.empty.err { color: var(--red-600); border-color: var(--red-200); background: var(--red-50); }
.empty.err button { margin-top: 12px; }
.err-hint { display: block; margin-top: 6px; color: var(--red-600); font-size: 12px; }
.err-hint a { color: var(--blue-600); text-decoration: underline; }

/* 待办 */
.todo { background: var(--k-card); border: 1px solid var(--k-line); border-radius: 12px; padding: 18px; margin-top: 18px; }
.todo h2 { font-size: 16px; margin: 0 0 14px; }
.todo-item { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--k-line); }
.todo-item:last-child { border-bottom: none; }
.todo-bar { width: 4px; align-self: stretch; border-radius: 4px; min-height: 38px; }
.bar-red { background: var(--red-600); }
.bar-amber { background: var(--amber-600); }
.bar-blue { background: var(--blue-800); }
.todo-text { flex: 1; font-size: 13px; }
.todo-text :deep(b) { color: var(--k-ink); font-weight: 700; }
.todo-empty { color: var(--k-muted); font-size: 13px; margin: 4px 0 0; }

/* 无权限 */
.forbidden { text-align: center; padding: 48px 20px; }
.forbidden h2 { color: var(--danger); margin-bottom: 12px; }
.forbidden p { color: var(--muted); margin: 8px 0; }

/* 弹窗内保留原 .btn 语义（沿用全局按钮） */
.btn-danger { background: var(--danger); color: #fff; border: 1px solid var(--danger); }
.btn-danger:hover { opacity: 0.9; }
.err { color: var(--danger); font-size: 13px; }
.muted { color: var(--muted); }
.guide { max-width: 480px; position: relative; }
.guide-close { position: absolute; top: 8px; right: 12px; background: none; border: none; font-size: 24px; line-height: 1; color: var(--muted); cursor: pointer; padding: 4px; }
.guide-close:hover { color: var(--ink); }
.guide-sub { color: var(--muted); margin: 0 0 14px; font-size: 14px; }
.guide-steps { margin: 0; padding-left: 20px; }
.guide-steps li { margin-bottom: 14px; line-height: 1.65; font-size: 14px; }
.guide-steps b { color: var(--brand); }
.guide-tip { background: rgba(96,165,250,0.1); border: 1px solid rgba(96,165,250,0.3); border-radius: 10px; padding: 10px 12px; font-size: 13px; color: var(--muted); margin: 16px 0 4px; line-height: 1.6; }
.guide-tip b { color: var(--brand); }
.help-fab { position: fixed; right: 20px; bottom: 20px; width: 44px; height: 44px; border-radius: 50%; background: var(--brand); color: #fff; border: none; font-size: 20px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.25); z-index: 90; display: flex; align-items: center; justify-content: center; }
.help-fab:hover { opacity: 0.9; }

/* ===== 响应式 ===== */
@media (max-width: 900px) {
  .stats { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .topbar { align-items: stretch; }
  .topbar .actions { flex: 1; }
  .topbar .actions .k-btn { flex: 1; }
  .stats { grid-template-columns: repeat(2, 1fr); gap: 10px; }
  .stat .num { font-size: 24px; }
  /* 表格转卡片式：隐藏表头，每行块级展示 */
  .thead { display: none; }
  .table .trow,
  .table.has-op .trow { grid-template-columns: 1fr auto; grid-auto-rows: min-content; gap: 4px 10px; padding: 12px 14px; position: relative; }
  .trow > div { padding: 2px 0; }
  .cust { grid-column: 1; grid-row: 1; }
  .col-op { grid-column: 2; grid-row: 1; }
  .row-del { opacity: 1; }
}
</style>
