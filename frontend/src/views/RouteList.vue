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
const statusOptions: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'consulting', label: '咨询中' },
  { key: 'awaiting_pk_confirm', label: '待确认' },
  { key: 'awaiting_agency_revision', label: '待旅行社修订' },
  { key: 'awaiting_quote', label: '待报价' },
  { key: 'awaiting_feedback', label: '待反馈' },
  { key: 'awaiting_confirm', label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'booked', label: '已成单' },
  { key: 'pending_followup', label: '待跟进' },
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
    <div v-else class="tbl-wrap">
      <table class="list-table">
        <thead>
          <tr>
            <th>客户</th><th>目的地</th><th>版本</th><th>模式</th>
            <th>旅行社</th><th>人数</th><th>状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in routes" :key="r.id" class="row" @click="open(r)">
            <td data-label="客户">{{ r.customerNameCn || r.customerName }}</td>
            <td data-label="目的地">{{ r.destination }}</td>
            <td data-label="版本">{{ verLabel(r) }}</td>
            <td data-label="模式">{{ r.modeKey === 'collab' ? '协作' : '自营' }}</td>
            <td data-label="旅行社">{{ r.agency || '-' }}</td>
            <td data-label="人数">{{ r.groupSize }}</td>
            <td data-label="状态"><span class="badge" :class="r.statusKey">{{ STATUS_LABEL[r.statusKey] }}</span></td>
          </tr>
          <tr v-if="!routes.length"><td colspan="7" class="muted">暂无路线</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.filter { padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; }
.count { color: var(--muted); font-size: 13px; }
.list-table { width: 100%; min-width: 680px; border-collapse: collapse; background: var(--card); border-radius: var(--r-md); overflow: hidden; }
.list-table th, .list-table td { padding: 10px 14px; border-bottom: 1px solid var(--line); text-align: left; }
.list-table th { background: var(--bg); font-size: 13px; color: var(--muted); }
.row { cursor: pointer; }
.row:hover { background: var(--brand-50); }
.badge { font-size: 12px; padding: 2px 8px; border-radius: var(--r-pill); background: var(--surface-2); color: var(--muted); border: 1px solid var(--line); }
.badge.awaiting_pk_confirm { background: var(--warn-50); color: var(--warn); border-color: #f6d9a8; }
.badge.awaiting_quote { background: var(--info-50); color: var(--info); border-color: #cfe0fc; }
.badge.awaiting_confirm, .badge.confirmed { background: var(--ok-50); color: var(--ok); border-color: #bfead8; }
.badge.lost { background: var(--danger-50); color: var(--danger); border-color: #f6c9c5; }
.muted { color: var(--muted); }

/* 移动端：数据表转卡片（统一断点 ≤640） */
@media (max-width: 640px) {
  .tbl-wrap { overflow: visible; }
  .list-table {
    display: block; min-width: 0; width: 100%;
    background: transparent; border: none; border-radius: 0; overflow: visible;
  }
  .list-table thead { display: none; }
  .list-table tbody { display: block; }
  .list-table tbody tr {
    display: block; background: var(--card); border: 1px solid var(--line);
    border-radius: var(--r-md); padding: 4px 14px; margin-bottom: 12px;
  }
  .list-table tbody tr:hover { background: var(--card); }
  .list-table td {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    padding: 9px 0; border-bottom: 1px solid var(--line); text-align: right; font-size: 13px;
  }
  .list-table td:last-child { border-bottom: none; }
  .list-table td::before {
    content: attr(data-label); color: var(--muted); font-size: 12px; font-weight: 600;
    text-align: left; flex: none;
  }
  .list-table td[colspan]::before { display: none; }
  .list-table td[colspan] { justify-content: center; text-align: center; }
}
</style>
