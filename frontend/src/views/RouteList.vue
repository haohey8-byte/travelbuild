<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRouteStore } from '@/stores/route'
import type { Route, RouteStatusKey } from '@/types'

const router = useRouter()
const store = useRouteStore()
const { routes, loading, filterStatus } = storeToRefs(store)

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
const statusOptions: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'consulting', label: '咨询中' },
  { key: 'awaiting_pk_confirm', label: '待一手确认' },
  { key: 'awaiting_agency_revision', label: '待旅行社修订' },
  { key: 'awaiting_quote', label: '待报价' },
  { key: 'awaiting_feedback', label: '待反馈' },
  { key: 'awaiting_confirm', label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'lost', label: '已流失' },
]

onMounted(() => store.load())
watch(filterStatus, () => store.load())

function open(r: Route) {
  router.push(`/routes/${r.id}`)
}
function verLabel(r: Route) {
  return r.versions?.[0]?.version ?? r.version ?? 'v1'
}
</script>

<template>
  <div>
    <h1 class="page-title">路线管理 · 列表</h1>
    <div class="toolbar">
      <select v-model="filterStatus" class="filter">
        <option v-for="o in statusOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
      </select>
      <span class="count">共 {{ routes.length }} 条</span>
    </div>
    <p v-if="loading">加载中…</p>
    <table v-else class="list-table">
      <thead>
        <tr>
          <th>客户</th><th>目的地</th><th>版本</th><th>模式</th>
          <th>旅行社</th><th>人数</th><th>状态</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in routes" :key="r.id" class="row" @click="open(r)">
          <td>{{ r.customerNameCn || r.customerName }}</td>
          <td>{{ r.destination }}</td>
          <td>{{ verLabel(r) }}</td>
          <td>{{ r.modeKey === 'collab' ? '协作' : '自营' }}</td>
          <td>{{ r.agency || '-' }}</td>
          <td>{{ r.groupSize }}</td>
          <td><span class="badge" :class="r.statusKey">{{ STATUS_LABEL[r.statusKey] }}</span></td>
        </tr>
        <tr v-if="!routes.length"><td colspan="7" class="muted">暂无路线</td></tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.filter { padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; }
.count { color: var(--muted); font-size: 13px; }
.list-table { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 12px; overflow: hidden; }
.list-table th, .list-table td { padding: 10px 14px; border-bottom: 1px solid var(--line); text-align: left; }
.list-table th { background: var(--bg); font-size: 13px; color: var(--muted); }
.row { cursor: pointer; }
.row:hover { background: var(--brand-soft); }
.badge { font-size: 12px; padding: 2px 8px; border-radius: 6px; background: var(--bg); color: var(--muted); }
.badge.awaiting_pk_confirm { background: #fff4e5; color: #b76e00; }
.badge.awaiting_quote { background: #e8f0fe; color: #2f80ed; }
.badge.awaiting_confirm, .badge.confirmed { background: #e6f7ef; color: #1aab8a; }
.badge.lost { background: #fdeaea; color: #e2483d; }
.muted { color: var(--muted); }
</style>
