<script setup lang="ts">
import { onMounted, ref } from 'vue'
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

const auth = useAuthStore()
const { user } = storeToRefs(auth)

const list = ref<CaseItem[]>([])
const loading = ref(true)
const routes = ref<Route[]>([])
const routeId = ref('')
const busy = ref(false)
const err = ref('')
const selected = ref<CaseItem | null>(null)

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
  selected.value = null
  await load()
}
function openDetail(c: CaseItem) {
  selected.value = selected.value?.id === c.id ? null : c
}

function routeName(r: Route): string {
  return safeName(r.customerNameCn, r.customerName)
}
function caseTitle(c: CaseItem): string {
  return safeText(c.title) || safeName(c.customerNameCn, c.customerName) || safeText(c.destination) || '未命名案例'
}
</script>

<template>
  <div>
    <h1 class="page-title">案例展示</h1>

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

    <p v-if="err" class="err">{{ err }}</p>
    <p v-if="loading">加载中…</p>
    <div v-else class="case-grid">
      <div
        v-for="c in list"
        :key="c.id"
        class="card"
        :class="{ on: selected?.id === c.id }"
        @click="openDetail(c)"
      >
        <div class="case-title">{{ caseTitle(c) }}</div>
        <div class="case-meta">{{ c.destination }} · {{ c.days }} 天 · {{ c.theme }}</div>
        <div class="case-price">{{ c.priceRange }}</div>
        <div class="case-status" :class="c.status">{{ c.status }}</div>
        <div v-if="user" class="case-actions" @click.stop>
          <button v-if="c.status !== 'published'" class="btn" @click="onPublish(c.id)">发布</button>
          <button v-else class="btn" @click="onUnpublish(c.id)">下线</button>
          <button class="btn ghost sm danger" @click="onDelete(c.id)">删除</button>
        </div>
      </div>
      <p v-if="!list.length" class="muted">暂无案例</p>
    </div>

    <div v-if="selected" class="card detail">
      <h3>案例详情</h3>
      <div class="kv"><span>目的地</span><b>{{ selected.destination }}</b></div>
      <div class="kv"><span>天数</span><b>{{ selected.days }}</b></div>
      <div class="kv"><span>主题</span><b>{{ selected.theme }}</b></div>
      <div class="kv"><span>价格区间</span><b>{{ selected.priceRange }}</b></div>
      <div class="kv"><span>状态</span><b>{{ selected.status }}</b></div>
      <p v-if="selected.highlights?.length" class="hl">亮点：{{ selected.highlights.join('、') }}</p>
    </div>
  </div>
</template>

<style scoped>
.manage { margin-bottom: 14px; }
.muted { color: var(--muted); font-size: 13px; }
.derive { display: flex; gap: 8px; margin-top: 8px; }
.field { flex: 1; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
.case-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; cursor: pointer; }
.card.on { border-color: var(--brand); }
.case-title { font-weight: 600; }
.case-meta { color: var(--muted); font-size: 13px; margin: 4px 0; }
.case-price { color: var(--brand); font-weight: 600; }
.case-status { font-size: 12px; color: var(--muted); margin-top: 4px; }
.case-status.published { color: var(--ok); }
.case-status.offline { color: var(--danger); }
.case-actions { margin-top: 8px; display: flex; gap: 6px; }
.detail { margin-top: 16px; cursor: default; }
.kv { display: flex; gap: 12px; padding: 4px 0; }
.kv span { color: var(--muted); width: 72px; }
.hl { color: var(--muted); font-size: 13px; }
.muted { color: var(--muted); }
.err { color: var(--danger); }
.btn.ghost { background: transparent; }
.btn.ghost.sm { padding: 2px 8px; font-size: 12px; }
.btn.ghost.danger { color: var(--danger); border-color: var(--danger); }

@media (max-width: 560px) {
  .case-grid { grid-template-columns: 1fr; }
  .derive { flex-direction: column; align-items: stretch; }
  .detail .kv { grid-template-columns: 1fr; }
}
</style>
