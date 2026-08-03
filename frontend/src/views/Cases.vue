<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import {
  fetchCases,
  fetchCasesManage,
  createCase,
  importCaseHtml,
  createCaseFromRoute,
  publishCase,
  unpublishCase,
  deleteCase,
} from '@/api/cases'
import { fetchRoutes } from '@/api/routes'
import { useAuthStore } from '@/stores/auth'
import { safeName, safeText } from '@/utils/name'
import type { CaseItem, Route } from '@/types'

const router = useRouter()
const auth = useAuthStore()
const { user } = storeToRefs(auth)

const isPandaking = computed(() => user.value?.role === 'pandaking')
const isAgency = computed(() => user.value?.role === 'agency')
const isProvincial = computed(() => user.value?.role === 'provincial')

const list = ref<CaseItem[]>([])
const loading = ref(true)
const err = ref('')

// —— 派生 ——
const routes = ref<Route[]>([])
const deriveOpen = ref(false)
const routeId = ref('')
const deriveBusy = ref(false)

// —— 筛选 / 排序 ——
const kw = ref('')
const fDest = ref('')
const fTheme = ref('')
const fDays = ref('')
const sortBy = ref<'new' | 'daysAsc' | 'priceAsc' | 'priceDesc'>('new')
const moreDestOpen = ref(false)
const moreThemeOpen = ref(false)

// —— 新建空白弹窗 ——
const showCreate = ref(false)
const createBusy = ref(false)
const createForm = ref({ title: '', destination: '', days: '', theme: '', priceRange: '' })
const createErr = ref('')

// —— 导入 HTML 微站弹窗 ——
const showImport = ref(false)
const importBusy = ref(false)
const importErr = ref('')
const importFile = ref<File | null>(null)
const importName = ref('')
const importSize = ref('')
const importInputRef = ref<HTMLInputElement | null>(null)

function openImport() {
  importFile.value = null
  importName.value = ''
  importSize.value = ''
  importErr.value = ''
  showImport.value = true
  // 下次打开重新触发文件选择
  setTimeout(() => importInputRef.value?.click(), 60)
}
function onPickImport() {
  importInputRef.value?.click()
}
function onImportFile(e: Event) {
  const target = e.target as HTMLInputElement
  const f = target.files?.[0]
  if (!f) return
  const name = f.name.toLowerCase()
  if (!name.endsWith('.html') && !name.endsWith('.htm') && f.type !== 'text/html') {
    importErr.value = '请选择 .html 文件'
    return
  }
  if (f.size > 5 * 1024 * 1024) {
    importErr.value = 'HTML 文件超过 5MB 上限'
    return
  }
  importFile.value = f
  importName.value = f.name
  importSize.value = f.size > 1024 * 1024 ? `${(f.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(f.size / 1024)} KB`
  importErr.value = ''
}
async function onImport() {
  if (!importFile.value) {
    importErr.value = '请先选择 .html 文件'
    return
  }
  importBusy.value = true
  try {
    const text = await importFile.value.text()
    const created = await importCaseHtml(text)
    showImport.value = false
    router.push(`/cases/${created.id}`)
  } catch (e: any) {
    importErr.value = e?.response?.data?.error || e?.response?.data?.message || e?.message || '导入失败'
  } finally {
    importBusy.value = false
  }
}

onMounted(load)

async function load() {
  loading.value = true
  err.value = ''
  try {
    // 登录态走管理接口（草稿/下线可见——新建空白/派生的草稿必须出现在列表）；
    // 未登录公开接口仅 published（对外案例展示页）
    list.value = user.value ? await fetchCasesManage() : await fetchCases()
    if (user.value) routes.value = await fetchRoutes()
  } catch (e: any) {
    err.value = e?.response?.data?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

// —— KPI（全部来自现有数据，不造假） ——
const kpi = computed(() => {
  const published = list.value.filter((c) => c.status === 'published').length
  const draft = list.value.filter((c) => c.status === 'draft').length
  const offline = list.value.filter((c) => c.status === 'offline').length
  const incomplete = list.value.filter(
    (c) => (c.status === 'draft') && (!c.title || !c.cover),
  ).length
  return { published, draft, offline, total: list.value.length, incomplete }
})

// —— chips 选项 ——
const destOptions = computed(() => uniq(list.value.map((c) => c.destination).filter(Boolean)))
const themeOptions = computed(() => uniq(list.value.map((c) => c.theme).filter(Boolean)))
const VISIBLE_DEST = 5
const VISIBLE_THEME = 4
const visibleDests = computed(() =>
  moreDestOpen.value ? destOptions.value : destOptions.value.slice(0, VISIBLE_DEST),
)
const visibleThemes = computed(() =>
  moreThemeOpen.value ? themeOptions.value : themeOptions.value.slice(0, VISIBLE_THEME),
)
function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr))
}

function priceNum(c: CaseItem): number {
  const m = (c.priceRange || '').match(/[\d,]+/)
  return m ? Number(m[0].replace(/,/g, '')) : 0
}
function daysBucket(c: CaseItem): string {
  if (c.days <= 5) return 'le5'
  if (c.days <= 10) return '6to10'
  return 'gt10'
}

const view = computed(() => {
  const k = kw.value.trim().toLowerCase()
  const arr = list.value.filter((c) => {
    if (fDest.value && c.destination !== fDest.value) return false
    if (fTheme.value && c.theme !== fTheme.value) return false
    if (fDays.value && daysBucket(c) !== fDays.value) return false
    if (k) {
      const hay = [c.title, c.destination, ...(c.highlights || [])].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(k)) return false
    }
    return true
  })
  const s = sortBy.value
  arr.sort((a, b) => {
    switch (s) {
      case 'daysAsc': return a.days - b.days
      case 'priceAsc': return priceNum(a) - priceNum(b)
      case 'priceDesc': return priceNum(b) - priceNum(a)
      default: return (b.publishedAt || '').localeCompare(a.publishedAt || '')
    }
  })
  return arr
})

function hasFilter() {
  return !!(kw.value || fDest.value || fTheme.value || fDays.value)
}
function resetFilter() {
  kw.value = ''
  fDest.value = ''
  fTheme.value = ''
  fDays.value = ''
}

function caseTitle(c: CaseItem): string {
  return safeText(c.title) || safeText(c.destination) || '未命名案例'
}
function routeName(r: Route): string {
  return safeName(r.customerNameCn, r.customerName)
}
function openDetail(c: CaseItem) {
  router.push(`/cases/${c.id}`)
}

// —— 派生 ——
async function onDerive() {
  if (!routeId.value) {
    err.value = '请选择一条已确认路线'
    return
  }
  deriveBusy.value = true
  try {
    await createCaseFromRoute(routeId.value)
    routeId.value = ''
    deriveOpen.value = false
    await load()
  } catch (e: any) {
    err.value = e?.response?.data?.message || '派生失败（需已确认路线）'
  } finally {
    deriveBusy.value = false
  }
}

// —— 新建空白 ——
function openCreate() {
  createForm.value = { title: '', destination: '', days: '', theme: '', priceRange: '' }
  createErr.value = ''
  showCreate.value = true
}
async function onCreate() {
  const f = createForm.value
  if (!f.title.trim() || !f.destination.trim()) {
    createErr.value = '请填写标题和目的地'
    return
  }
  const days = Number(f.days)
  if (f.days && (!Number.isInteger(days) || days < 1 || days > 60)) {
    createErr.value = '天数需为 1-60 的整数'
    return
  }
  createBusy.value = true
  try {
    const created = await createCase({
      title: f.title.trim(),
      destination: f.destination.trim(),
      days: f.days ? days : 0,
      theme: f.theme.trim(),
      priceRange: f.priceRange.trim(),
    })
    showCreate.value = false
    router.push(`/cases/${created.id}`)
  } catch (e: any) {
    createErr.value = e?.response?.data?.message || '创建失败'
  } finally {
    createBusy.value = false
  }
}

// —— 状态操作 ——
async function onPublish(c: CaseItem) {
  await publishCase(c.id)
  await load()
}
async function onUnpublish(c: CaseItem) {
  await unpublishCase(c.id)
  await load()
}
async function onDelete(c: CaseItem) {
  if (!confirm(`确认删除案例「${caseTitle(c)}」？此操作不可恢复`)) return
  await deleteCase(c.id)
  await load()
}
</script>

<template>
  <div class="cases-page">
    <!-- Hero -->
    <section class="hero">
      <h1 class="hero-h">案例中心</h1>
      <p class="hero-sub">三角色共创经典路线 — 新建空白案例、从行程定制导入、导入 HTML 微站三种创建方式</p>
      <div class="kpi-row">
        <div class="kpi">
          <div class="kpi-ico pri">★</div>
          <div><div class="kpi-l">已发布</div><div class="kpi-v">{{ kpi.published }}</div><div class="kpi-d">对外可看</div></div>
        </div>
        <div class="kpi">
          <div class="kpi-ico warn">!</div>
          <div><div class="kpi-l">草稿</div><div class="kpi-v">{{ kpi.draft }}</div><div class="kpi-d" :class="{ warn: kpi.incomplete > 0 }">{{ kpi.incomplete }} 待完善</div></div>
        </div>
        <div class="kpi">
          <div class="kpi-ico neu">↧</div>
          <div><div class="kpi-l">已下线</div><div class="kpi-v">{{ kpi.offline }}</div><div class="kpi-d">不对外</div></div>
        </div>
        <div class="kpi">
          <div class="kpi-ico neu">≡</div>
          <div><div class="kpi-l">案例总数</div><div class="kpi-v">{{ kpi.total }}</div><div class="kpi-d">全部状态</div></div>
        </div>
      </div>
    </section>

    <!-- Action Bar -->
    <section class="actions">
      <button class="btn btn-primary" @click="openCreate">+ 新建空白案例</button>
      <button class="btn btn-soft" @click="openImport">↑ 导入 HTML 微站</button>
      <button class="btn btn-ghost" :class="{ active: deriveOpen }" @click="deriveOpen = !deriveOpen">
        ↻ 从行程定制导入
      </button>
      <div class="btn-spacer"></div>
      <span class="count">共 {{ view.length }} 个案例</span>
      <select v-model="sortBy" class="sort-select" title="排序">
        <option value="new">最新发布</option>
        <option value="daysAsc">天数 ↑</option>
        <option value="priceAsc">价格 ↑</option>
        <option value="priceDesc">价格 ↓</option>
      </select>
    </section>

    <!-- 派生面板（展开式） -->
    <section v-if="deriveOpen && user" class="derive-panel">
      <select v-model="routeId" class="field">
        <option value="">选择已确认行程…</option>
        <option v-for="r in routes" :key="r.id" :value="r.id">
          {{ routeName(r) }} · {{ safeText(r.destination) }}
        </option>
      </select>
      <button class="btn btn-primary btn-sm" :disabled="deriveBusy" @click="onDerive">
        {{ deriveBusy ? '导入中…' : '导入脱敏草稿' }}
      </button>
      <p class="hint">服务端强制合规：自动屏蔽真名 / 证件 / 合同价</p>
    </section>

    <!-- Filter chips -->
    <section class="filters">
      <span class="filter-label">目的地</span>
      <span class="chip" :class="{ active: !fDest }" @click="fDest = ''">全部</span>
      <span
        v-for="d in visibleDests"
        :key="d"
        class="chip"
        :class="{ active: fDest === d }"
        @click="fDest = fDest === d ? '' : d"
      >{{ d }}</span>
      <span
        v-if="destOptions.length > VISIBLE_DEST"
        class="chip chip-more"
        @click="moreDestOpen = !moreDestOpen"
      >{{ moreDestOpen ? '收起' : `+ ${destOptions.length - VISIBLE_DEST} 更多` }}</span>

      <span class="filter-label" style="margin-left: 14px">主题</span>
      <span class="chip" :class="{ active: !fTheme }" @click="fTheme = ''">全部</span>
      <span
        v-for="t in visibleThemes"
        :key="t"
        class="chip"
        :class="{ active: fTheme === t }"
        @click="fTheme = fTheme === t ? '' : t"
      >{{ t }}</span>
      <span
        v-if="themeOptions.length > VISIBLE_THEME"
        class="chip chip-more"
        @click="moreThemeOpen = !moreThemeOpen"
      >{{ moreThemeOpen ? '收起' : `+ ${themeOptions.length - VISIBLE_THEME} 更多` }}</span>

      <span class="filter-label" style="margin-left: 14px">天数</span>
      <span class="chip" :class="{ active: !fDays }" @click="fDays = ''">全部</span>
      <span class="chip" :class="{ active: fDays === 'le5' }" @click="fDays = fDays === 'le5' ? '' : 'le5'">≤5</span>
      <span class="chip" :class="{ active: fDays === '6to10' }" @click="fDays = fDays === '6to10' ? '' : '6to10'">6-10</span>
      <span class="chip" :class="{ active: fDays === 'gt10' }" @click="fDays = fDays === 'gt10' ? '' : 'gt10'">&gt;10</span>

      <input v-model="kw" class="filter-search" placeholder="搜索标题 / 亮点…" />
      <button v-if="hasFilter()" class="btn btn-ghost btn-sm" @click="resetFilter">重置</button>
    </section>

    <p v-if="err" class="err">{{ err }}</p>

    <!-- Grid -->
    <section v-if="loading" class="loading-tip">加载中…</section>
    <section v-else-if="view.length" class="grid">
      <div
        v-for="c in view"
        :key="c.id"
        class="card"
        @click="openDetail(c)"
      >
        <div class="cover" :style="c.cover ? `background-image:url('${c.cover}')` : ''">
          <span v-if="!c.cover" class="cover-ph">{{ caseTitle(c).slice(0, 1) }}</span>
          <span class="status-badge" :class="c.status">
            {{ c.status === 'published' ? '已发布' : c.status === 'draft' ? '草稿' : '已下线' }}
          </span>
        </div>
        <div class="body">
          <div class="title">{{ caseTitle(c) }}</div>
          <div class="dest">{{ c.destination }} · {{ c.days }} 天 · {{ c.theme || '—' }}</div>
          <div v-if="c.highlights?.length" class="hl">
            <span v-for="h in c.highlights.slice(0, 4)" :key="h" class="hl-chip">{{ h }}</span>
            <span v-if="c.highlights.length > 4" class="hl-chip more">+{{ c.highlights.length - 4 }}</span>
          </div>
          <div class="meta-row">
            <div class="params">
              <span v-if="c.contentHtml" class="tag-html">HTML 微站</span>
              <span v-if="c.groupSize"><b>{{ c.groupSize }} 人</b></span>
            </div>
            <div class="price">{{ c.priceRange || '—' }}</div>
          </div>
          <div v-if="user" class="card-actions" @click.stop>
            <template v-if="isPandaking || (isAgency && c.agencyId === user?.agencyId) || (isProvincial && c.createdById === user?.id)">
              <button v-if="c.status !== 'published'" class="btn btn-sm btn-soft" @click="onPublish(c)">发布</button>
              <button v-else class="btn btn-sm btn-ghost" @click="onUnpublish(c)">下线</button>
              <button class="btn btn-sm btn-ghost danger" @click="onDelete(c)">删除</button>
              <span class="card-edit" @click="openDetail(c)">编辑 →</span>
            </template>
          </div>
        </div>
      </div>
    </section>

    <!-- 空状态 -->
    <section v-else class="empty">
      <div class="empty-illust"></div>
      <div class="empty-title">还没有匹配的案例</div>
      <div class="empty-sub">
        {{ hasFilter() ? '试试清除筛选条件' : (user ? '新建空白案例、从行程定制导入，或导入 HTML 微站' : '暂无公开案例') }}
      </div>
      <div v-if="user" style="display: flex; gap: 8px; justify-content: center">
        <button class="btn btn-primary" @click="openCreate">+ 新建空白案例</button>
        <button class="btn btn-soft" @click="deriveOpen = true; !routeId && (routeId = routes[0]?.id || '')">↻ 从行程定制导入</button>
      </div>
      <button v-else-if="hasFilter()" class="btn btn-ghost" @click="resetFilter">清除筛选</button>
    </section>
  </div>

  <!-- 新建空白案例弹窗 -->
  <div v-if="showCreate" class="modal-mask" @click.self="showCreate = false">
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title">新建空白案例</div>
        <div class="modal-close" @click="showCreate = false">✕</div>
      </div>
      <div class="modal-body">
        <div class="field-row">
          <div class="field-label">案例标题<span class="req">*</span></div>
          <input v-model="createForm.title" class="field-input" placeholder="例如：清迈兰纳文化 5 日深度游" />
        </div>
        <div class="row2">
          <div class="field-row">
            <div class="field-label">目的地<span class="req">*</span></div>
            <input v-model="createForm.destination" class="field-input" placeholder="如：清迈" />
          </div>
          <div class="field-row">
            <div class="field-label">天数<span class="req">*</span></div>
            <input v-model="createForm.days" class="field-input" type="number" min="1" max="60" placeholder="如：5" />
          </div>
        </div>
        <div class="row2">
          <div class="field-row">
            <div class="field-label">主题</div>
            <input v-model="createForm.theme" class="field-input" placeholder="如：亲子自然" />
          </div>
          <div class="field-row">
            <div class="field-label">参考价</div>
            <input v-model="createForm.priceRange" class="field-input" placeholder="如：¥2.5-3.5 万" />
          </div>
        </div>
        <p v-if="createErr" class="err">{{ createErr }}</p>
        <div class="field-hint">其他字段（封面、亮点、描述、行程等）创建后可继续编辑</div>
      </div>
      <div class="modal-foot">
        <button class="btn" @click="showCreate = false">取消</button>
        <button class="btn btn-primary" :disabled="createBusy" @click="onCreate">
          {{ createBusy ? '创建中…' : '创建并编辑' }}
        </button>
      </div>
    </div>
  </div>

  <!-- 导入 HTML 微站弹窗 -->
  <div v-if="showImport" class="modal-mask" @click.self="showImport = false">
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title">导入 HTML 微站作为案例</div>
        <div class="modal-close" @click="showImport = false">✕</div>
      </div>
      <div class="modal-body">
        <div class="dropzone" @click="onPickImport" @dragover.prevent @drop.prevent="(e: DragEvent) => { const f = e.dataTransfer?.files?.[0]; if (f) { const ev = { target: { files: [f] } }; onImportFile(ev as unknown as Event) } }">
          <template v-if="!importFile">
            <div class="dropzone-ico">↑</div>
            <div class="dropzone-text">点击或拖拽 .html 文件</div>
            <div class="dropzone-sub">≤ 5MB · 服务端自动 sanitize</div>
          </template>
          <template v-else>
            <div class="dropzone-ico ok">✓</div>
            <div class="dropzone-text">{{ importName }}</div>
            <div class="dropzone-sub">{{ importSize }} · 点击可重新选择</div>
          </template>
        </div>
        <p v-if="importErr" class="err">{{ importErr }}</p>
        <div class="field-hint">导入后自动创建草稿案例：标题取 HTML 内 h1，整份 HTML 作为案例正文，其余字段留空待补</div>
      </div>
      <div class="modal-foot">
        <button class="btn" @click="showImport = false">取消</button>
        <button class="btn btn-primary" :disabled="importBusy || !importFile" @click="onImport">
          {{ importBusy ? '导入中…' : '上传并创建' }}
        </button>
      </div>
    </div>
  </div>
  <input
    ref="importInputRef"
    type="file"
    accept=".html,.htm,text/html"
    hidden
    @change="onImportFile"
  />
</template>

<style scoped>
.cases-page { max-width: 1200px; margin: 0 auto; padding: 0 0 48px; }

/* Hero */
.hero { padding: 20px 0 18px; }
.hero-h { font-size: clamp(19px, 3.2vw, 24px); font-weight: 700; letter-spacing: -.01em; margin-bottom: 6px; }
.hero-sub { color: var(--muted); font-size: 13.5px; }
.kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 16px; }
.kpi { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); padding: 13px 16px; display: flex; align-items: center; gap: 12px; }
.kpi-ico { width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 15px; }
.kpi-ico.pri { background: var(--brand-50); color: var(--brand); }
.kpi-ico.warn { background: var(--warn-50); color: var(--warn); }
.kpi-ico.neu { background: #eef2f7; color: var(--ink-2); }
.kpi-l { font-size: 12px; color: var(--muted); margin-bottom: 3px; }
.kpi-v { font-size: 21px; font-weight: 700; line-height: 1.1; }
.kpi-d { font-size: 11px; color: var(--ok); margin-top: 3px; }
.kpi-d.warn { color: var(--warn); }

/* Action Bar */
.actions { display: flex; gap: 10px; align-items: center; margin: 18px 0 12px; padding: 12px 14px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-md); box-shadow: var(--sh-sm); flex-wrap: wrap; }
.count { font-size: 12.5px; color: var(--muted); }
.sort-select { padding: 6px 10px; border: 1px solid var(--line-strong); border-radius: var(--r-sm); font-size: 12.5px; background: var(--surface); color: var(--ink-2); font-family: inherit; }

.btn { padding: 8px 14px; border-radius: var(--r-sm); font-size: 13.5px; cursor: pointer; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); display: inline-flex; align-items: center; gap: 6px; font-family: inherit; font-weight: 600; transition: background .15s, color .15s, box-shadow .15s, transform .15s; }
.btn:hover { transform: translateY(-1px); }
.btn-primary { background: var(--brand); border-color: var(--brand); color: #fff; box-shadow: 0 1px 2px rgba(24, 95, 165, .2); }
.btn-primary:hover { background: var(--brand-600); box-shadow: 0 4px 12px rgba(24, 95, 165, .25); }
.btn-soft { background: var(--brand-50); border-color: transparent; color: var(--brand-600); }
.btn-soft.active { background: var(--brand); color: #fff; }
.btn-ghost { background: transparent; border-color: transparent; color: var(--ink-2); }
.btn-ghost:hover { background: var(--brand-50); color: var(--brand); }
.btn-ghost.danger { color: var(--danger); }
.btn-ghost.danger:hover { background: var(--danger-50); color: var(--danger); }
.btn-sm { padding: 5px 10px; font-size: 12px; border-radius: 6px; }

/* 派生面板 */
.derive-panel { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; padding: 12px 14px; background: var(--brand-50); border: 1px solid var(--brand-100); border-radius: var(--r-md); flex-wrap: wrap; }
.derive-panel .field { padding: 7px 10px; border: 1px solid var(--brand-100); border-radius: var(--r-sm); background: var(--surface); font-size: 13px; flex: 1; min-width: 200px; font-family: inherit; }
.hint { font-size: 11.5px; color: var(--muted); width: 100%; }

/* Filter chips */
.filters { display: flex; align-items: center; gap: 7px; margin-bottom: 16px; flex-wrap: wrap; }
.filter-label { font-size: 12px; color: var(--muted); font-weight: 600; }
.chip { padding: 5px 12px; border-radius: var(--r-pill); background: var(--surface); border: 1px solid var(--line-strong); font-size: 12.5px; color: var(--ink-2); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all .15s; }
.chip:hover { border-color: var(--brand-100); }
.chip.active { background: var(--brand); color: #fff; border-color: var(--brand); }
.chip-more { color: var(--brand-600); border-color: var(--brand-100); background: var(--brand-50); }
.filter-search { flex: 1; min-width: 200px; max-width: 300px; padding: 6px 12px; border-radius: var(--r-sm); border: 1px solid var(--line-strong); font-size: 13px; background: var(--surface); margin-left: auto; font-family: inherit; }
.filter-search:focus { outline: 2px solid var(--brand-100); border-color: var(--brand); }

/* Grid */
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-lg); overflow: hidden; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; display: flex; flex-direction: column; }
.card:hover { transform: translateY(-2px); box-shadow: var(--sh-md); border-color: var(--brand-100); }
.cover { aspect-ratio: 16/9; background: #d8e1ec center/cover no-repeat; position: relative; display: flex; align-items: center; justify-content: center; }
.cover-ph { width: 62px; height: 62px; border-radius: 50%; background: var(--surface); color: var(--brand); font-size: 26px; font-weight: 700; display: flex; align-items: center; justify-content: center; box-shadow: var(--sh-sm); }
.status-badge { position: absolute; top: 10px; left: 10px; padding: 3px 9px; border-radius: var(--r-pill); font-size: 11px; font-weight: 600; }
.status-badge.published { background: rgba(15, 157, 111, .92); color: #fff; }
.status-badge.draft { background: rgba(255, 255, 255, .94); color: var(--ink-2); border: 1px solid var(--line-strong); }
.status-badge.offline { background: rgba(216, 58, 46, .9); color: #fff; }

.body { padding: 13px 15px 14px; flex: 1; display: flex; flex-direction: column; }
.title { font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 4px; line-height: 1.4; }
.dest { font-size: 12.5px; color: var(--muted); margin-bottom: 10px; }
.hl { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
.hl-chip { font-size: 11px; padding: 2px 8px; border-radius: var(--r-pill); background: var(--brand-50); color: var(--brand-600); }
.hl-chip.more { background: #eef2f7; color: var(--ink-2); }
.meta-row { display: flex; justify-content: space-between; align-items: baseline; margin-top: auto; padding-top: 10px; border-top: 1px dashed var(--line); }
.params { display: flex; gap: 8px; font-size: 11.5px; color: var(--muted); align-items: center; }
.params b { color: var(--ink-2); font-weight: 600; }
.tag-html { font-size: 10.5px; padding: 1px 7px; border-radius: var(--r-pill); background: #eef2f7; color: var(--ink-2); border: 1px solid var(--line-strong); }
.price { font-size: 13px; color: var(--brand-600); font-weight: 700; }
.card-actions { display: flex; gap: 6px; margin-top: 10px; align-items: center; }
.card-edit { margin-left: auto; font-size: 12px; color: var(--brand); font-weight: 600; }

/* 空状态 */
.empty { background: var(--surface); border: 1px dashed var(--line-strong); border-radius: var(--r-lg); padding: 48px 24px; text-align: center; }
.empty-illust { width: 110px; height: 110px; margin: 0 auto 18px; border-radius: 50%; background: var(--brand-50); position: relative; }
.empty-illust::after { content: ""; position: absolute; inset: 16px; border-radius: 50%; border: 2px dashed var(--brand); opacity: .35; }
.empty-title { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
.empty-sub { font-size: 13px; color: var(--muted); margin-bottom: 16px; }

/* 弹窗 */
.modal-mask { position: fixed; inset: 0; background: rgba(18, 26, 41, .45); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 20px; }
.modal { width: 520px; max-width: 100%; background: var(--surface); border-radius: var(--r-lg); box-shadow: var(--sh-lg); overflow: hidden; }
.modal-head { padding: 16px 20px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; }
.modal-title { font-size: 16px; font-weight: 700; }
.modal-close { width: 26px; height: 26px; border-radius: 6px; color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.modal-close:hover { background: var(--surface-2); color: var(--ink); }
.modal-body { padding: 20px; }
.field-row { margin-bottom: 13px; }
.field-label { font-size: 12.5px; color: var(--ink-2); margin-bottom: 5px; font-weight: 600; }
.field-input { width: 100%; padding: 9px 12px; border: 1px solid var(--line-strong); border-radius: var(--r-sm); font-size: 14px; background: var(--surface); font-family: inherit; }
.field-input:focus { outline: 2px solid var(--brand-100); border-color: var(--brand); }
.row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.field-hint { font-size: 11.5px; color: var(--muted); margin-top: 6px; }
.dropzone {
  border: 2px dashed var(--line-strong); border-radius: var(--r-md); padding: 28px 20px;
  text-align: center; background: var(--surface-2); cursor: pointer; transition: all .15s;
}
.dropzone:hover { border-color: var(--brand-100); background: var(--brand-50); }
.dropzone-ico { width: 44px; height: 44px; border-radius: var(--r-md); background: var(--brand-50); color: var(--brand); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 10px; font-size: 19px; }
.dropzone-ico.ok { background: var(--ok-50); color: var(--ok); }
.dropzone-text { font-size: 14px; font-weight: 600; margin-bottom: 3px; word-break: break-all; }
.dropzone-sub { font-size: 12px; color: var(--muted); }
.modal-foot { padding: 13px 20px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 8px; background: var(--surface-2); }

.err { color: var(--danger); font-size: 13px; margin: 8px 0; }
.loading-tip { color: var(--muted); font-size: 13px; padding: 24px 0; }

@media (max-width: 1100px) {
  .grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 640px) {
  .grid { grid-template-columns: 1fr; }
  .kpi-row { grid-template-columns: repeat(2, 1fr); }
  .row2 { grid-template-columns: 1fr; }
  .filter-search { max-width: none; margin-left: 0; width: 100%; }
  .hero-sub { font-size: 13px; }
}
</style>
