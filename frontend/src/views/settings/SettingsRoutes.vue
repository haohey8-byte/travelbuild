<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { fetchRoutes } from '@/api/routes'
import type { Route, RouteStatusKey } from '@/types'

const router = useRouter()
const auth = useAuthStore()

const routes = ref<Route[]>([])
const loading = ref(false)

const isReadonly = auth.currentRole !== 'pandaking'

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

onMounted(load)
async function load() {
  loading.value = true
  try {
    // 后端按 JWT principal 物理隔绝：pandaking 全量；agency 仅自己 agencyId；provincial 仅自己 provincialId
    routes.value = await fetchRoutes()
  } catch {
    routes.value = []
  } finally {
    loading.value = false
  }
}

function open(r: Route) {
  // 非：只读态打开（隐藏保存/提交/协作按钮）；：可编辑
  // from=settings 标记来源：行程详情页据此返回「系统设置-我的路线」而非路线管理看板
  router.push({ path: `/routes/${r.id}`, query: { from: 'settings', ...(isReadonly ? { ro: '1' } : {}) } })
}
function verLabel(r: Route) {
  return r.versions?.[0]?.version ?? r.version ?? 'v1'
}
</script>

<template>
  <div>
    <div class="head">
      <h2 class="section-title">我的路线</h2>
      <span v-if="isReadonly" class="badge ro">只读概览</span>
    </div>
    <p class="muted">仅展示归属于本机构的路线（物理隔绝）。点击行查看详情。</p>

    <p v-if="loading">加载中…</p>
    <div v-else class="tbl-wrap">
      <table class="list-table">
        <thead>
          <tr><th>客户</th><th>目的地</th><th>版本</th><th>模式</th><th>人数</th><th>状态</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in routes" :key="r.id" class="row" @click="open(r)">
            <td data-label="客户">{{ r.customerNameCn || r.customerName }}</td>
            <td data-label="目的地">{{ r.destination }}</td>
            <td data-label="版本">{{ verLabel(r) }}</td>
            <td data-label="模式">{{ r.modeKey === 'collab' ? '协作' : '自营' }}</td>
            <td data-label="人数">{{ r.groupSize }}</td>
            <td data-label="状态"><span class="badge" :class="r.statusKey">{{ STATUS_LABEL[r.statusKey] }}</span></td>
          </tr>
          <tr v-if="!routes.length"><td colspan="6" class="muted">暂无路线</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; gap: 10px; }
.section-title { margin: 0; font-size: 20px; }
.muted { color: var(--muted); font-size: 13px; }
.badge.ro { background: var(--brand-50); color: var(--brand); font-size: 12px; padding: 2px 8px; border-radius: 999px; }
.tbl-wrap { margin-top: 12px; }
.list-table { width: 100%; min-width: 600px; border-collapse: collapse; background: var(--card); border-radius: var(--r-md); overflow: hidden; }
.list-table th, .list-table td { padding: 10px 14px; border-bottom: 1px solid var(--line); text-align: left; }
.list-table th { background: var(--bg); font-size: 13px; color: var(--muted); }
.row { cursor: pointer; }
.row:hover { background: var(--brand-50); }
.badge { font-size: 12px; padding: 2px 8px; border-radius: var(--r-pill); background: var(--surface-2); color: var(--muted); border: 1px solid var(--line); }
.badge.awaiting_pk_confirm { background: var(--warn-50); color: var(--warn); border-color: #f6d9a8; }
.badge.awaiting_quote { background: var(--info-50); color: var(--info); border-color: #cfe0fc; }
.badge.awaiting_confirm, .badge.confirmed { background: var(--ok-50); color: var(--ok); border-color: #bfead8; }
.badge.lost { background: var(--danger-50); color: var(--danger); border-color: #f6c9c5; }

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
