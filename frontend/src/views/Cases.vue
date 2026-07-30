<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import {
  fetchCases,
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

const list = ref<CaseItem[]>([])
const loading = ref(true)
const routes = ref<Route[]>([])
const routeId = ref('')
const busy = ref(false)
const err = ref('')

// 筛选 / 排序
const kw = ref('')
const fDest = ref('')
const fTheme = ref('')
const fDays = ref('') // '' | le5 | 6to10 | gt10
const fPrice = ref('') // '' | eco | std | lux
const sortBy = ref<'new' | 'daysAsc' | 'daysDesc' | 'priceAsc' | 'priceDesc'>('new')

onMounted(load)

async function load() {
  loading.value = true
  err.value = ''
  try {
    list.value = await fetchCases()
    if (user.value) {
      routes.value = await fetchRoutes()
    }
  } catch (e: any) {
    err.value = e?.response?.data?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

const destOptions = computed(() => uniq(list.value.map((c) => c.destination).filter(Boolean)))
const themeOptions = computed(() => uniq(list.value.map((c) => c.theme).filter(Boolean)))

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr))
}

// priceRange 为自由文本（如 "THB 12345"），提取首个数字用于排序/分桶
function priceNum(c: CaseItem): number {
  const m = (c.priceRange || '').match(/[\d,]+/)
  return m ? Number(m[0].replace(/,/g, '')) : 0
}
function daysBucket(c: CaseItem): string {
  if (c.days <= 5) return 'le5'
  if (c.days <= 10) return '6to10'
  return 'gt10'
}
function priceBucket(c: CaseItem): string {
  const n = priceNum(c)
  if (n <= 10000) return 'eco'
  if (n <= 30000) return 'std'
  return 'lux'
}

const view = computed(() => {
  const k = kw.value.trim().toLowerCase()
  const arr = list.value.filter((c) => {
    if (fDest.value && c.destination !== fDest.value) return false
    if (fTheme.value && c.theme !== fTheme.value) return false
    if (fDays.value && daysBucket(c) !== fDays.value) return false
    if (fPrice.value && priceBucket(c) !== fPrice.value) return false
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
      case 'daysDesc': return b.days - a.days
      case 'priceAsc': return priceNum(a) - priceNum(b)
      case 'priceDesc': return priceNum(b) - priceNum(a)
      default: return (b.publishedAt || '').localeCompare(a.publishedAt || '')
    }
  })
  return arr
})

function hasFilter() {
  return !!(kw.value || fDest.value || fTheme.value || fDays.value || fPrice.value)
}
function resetFilter() {
  kw.value = ''
  fDest.value = ''
  fTheme.value = ''
  fDays.value = ''
  fPrice.value = ''
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

async function onDerive() {
  if (!routeId.value) {
    err.value = '请选择一条已确认路线'
    return
  }
  busy.value = true
  try {
    await createCaseFromRoute(routeId.value)
    routeId.value = ''
    await load()
  } catch (e: any) {
    err.value = e?.response?.data?.message || '派生失败（需已确认路线）'
  } finally {
    busy.value = false
  }
}
async function onPublish(id: string) {
  await publishCase(id)
  await load()
}
async function onUnpublish(id: string) {
  await unpublishCase(id)
  await load()
}
async function onDelete(id: string) {
  if (!confirm('确认删除该案例？')) return
  await deleteCase(id)
  await load()
}
</script>

<template>
  <div class="cases-page">
    <h1 class="page-title">案例展示</h1>

    <!-- 管理面板（仅登录可见）：从已确认路线派生脱敏案例 -->
    <div v-if="user" class="card manage">
      <p class="muted">从「已确认」路线派生脱敏案例（服务端强制合规校验，屏蔽真名/证件/合同价）。</p>
      <div class="derive">
        <select v-model="routeId" class="field">
          <option value="">选择路线…</option>
          <option v-for="r in routes" :key="r.id" :value="r.id">
            {{ routeName(r) }} · {{ safeText(r.destination) }}
          </option>
        </select>
        <button class="btn btn-primary" :disabled="busy" @click="onDerive">派生案例</button>
      </div>
    </div>

    <!-- 公开筛选条 -->
    <div class="filters card">
      <input v-model="kw" class="field kw" placeholder="搜索标题 / 目的地 / 亮点" />
      <select v-model="fDest" class="field">
        <option value="">全部目的地</option>
        <option v-for="d in destOptions" :key="d" :value="d">{{ d }}</option>
      </select>
      <select v-model="fTheme" class="field">
        <option value="">全部主题</option>
        <option v-for="t in themeOptions" :key="t" :value="t">{{ t }}</option>
      </select>
      <select v-model="fDays" class="field">
        <option value="">全部天数</option>
        <option value="le5">≤ 5 天</option>
        <option value="6to10">6–10 天</option>
        <option value="gt10">&gt; 10 天</option>
      </select>
      <select v-model="fPrice" class="field">
        <option value="">全部价格</option>
        <option value="eco">经济 (≤1万)</option>
        <option value="std">标准 (1–3万)</option>
        <option value="lux">高端 (&gt;3万)</option>
      </select>
      <select v-model="sortBy" class="field">
        <option value="new">最新发布</option>
        <option value="daysAsc">天数 ↑</option>
        <option value="daysDesc">天数 ↓</option>
        <option value="priceAsc">价格 ↑</option>
        <option value="priceDesc">价格 ↓</option>
      </select>
      <button v-if="hasFilter()" class="btn ghost sm" @click="resetFilter">重置</button>
    </div>

    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading">加载中…</p>
    <div v-else class="case-grid">
      <div
        v-for="c in view"
        :key="c.id"
        class="card case-card"
        @click="openDetail(c)"
      >
        <div class="cover" :style="c.cover ? `background-image:url(${c.cover})` : ''">
          <span v-if="!c.cover" class="cover-ph">{{ caseTitle(c).slice(0, 1) }}</span>
        </div>
        <div class="case-body">
          <div class="case-title">{{ caseTitle(c) }}</div>
          <div class="case-meta">{{ c.destination }} · {{ c.days }} 天 · {{ c.theme }}</div>
          <div class="case-price">{{ c.priceRange }}</div>
          <div v-if="c.highlights?.length" class="hl">
            <span v-for="h in c.highlights" :key="h" class="chip">{{ h }}</span>
          </div>
        </div>
        <div class="case-status" :class="c.status">{{ c.status }}</div>
        <div v-if="user" class="case-actions" @click.stop>
          <button v-if="c.status !== 'published'" class="btn sm" @click="onPublish(c.id)">发布</button>
          <button v-else class="btn sm" @click="onUnpublish(c.id)">下线</button>
          <button class="btn ghost sm danger" @click="onDelete(c.id)">删除</button>
        </div>
      </div>
      <p v-if="!view.length" class="muted empty">没有匹配的案例</p>
    </div>
  </div>
</template>

<style scoped>
.cases-page { max-width: 1100px; margin: 0 auto; }
.manage { margin-bottom: 14px; }
.muted { color: var(--muted); font-size: 13px; }
.empty { padding: 24px 0; }
.filters {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  margin-bottom: 14px; padding: 12px;
}
.field {
  padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px;
  background: var(--card); color: var(--text);
}
.kw { flex: 1; min-width: 200px; }
.derive { display: flex; gap: 8px; margin-top: 8px; }
.case-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
.case-card { overflow: hidden; cursor: pointer; transition: border-color .15s, transform .15s; display: flex; flex-direction: column; }
.case-card:hover { border-color: var(--brand); transform: translateY(-2px); }
.cover {
  height: 140px; background: var(--brand-soft, var(--line)) center/cover no-repeat;
  display: flex; align-items: center; justify-content: center;
}
.cover-ph {
  font-size: 40px; font-weight: 700; color: var(--brand);
  background: var(--card); width: 64px; height: 64px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.case-body { padding: 12px; flex: 1; }
.case-title { font-weight: 600; }
.case-meta { color: var(--muted); font-size: 13px; margin: 4px 0; }
.case-price { color: var(--brand); font-weight: 600; }
.hl { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-size: 12px; background: var(--brand-soft, #eef); color: var(--brand); border-radius: 999px; padding: 2px 8px; }
.case-status { font-size: 12px; color: var(--muted); padding: 0 12px 8px; }
.case-status.published { color: var(--ok); }
.case-status.offline { color: var(--danger); }
.case-actions { padding: 0 12px 12px; display: flex; gap: 6px; }
.btn { padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--brand); color: #fff; cursor: pointer; }
.btn.sm { padding: 3px 10px; font-size: 12px; }
.btn.ghost { background: transparent; color: var(--text); }
.btn.ghost.sm { padding: 3px 10px; font-size: 12px; }
.btn.ghost.danger { color: var(--danger); border-color: var(--danger); }
.err { color: var(--danger); }

@media (max-width: 640px) {
  .case-grid { grid-template-columns: 1fr; }
  .derive { flex-direction: column; align-items: stretch; }
}
</style>
