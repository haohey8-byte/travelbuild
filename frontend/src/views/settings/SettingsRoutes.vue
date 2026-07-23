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
  // 非一手：只读态打开（隐藏保存/提交/协作按钮）；一手：可编辑
  router.push({ path: `/routes/${r.id}`, query: isReadonly ? { ro: '1' } : {} })
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
            <td>{{ r.customerNameCn || r.customerName }}</td>
            <td>{{ r.destination }}</td>
            <td>{{ verLabel(r) }}</td>
            <td>{{ r.modeKey === 'collab' ? '协作' : '自营' }}</td>
            <td>{{ r.groupSize }}</td>
            <td><span class="badge" :class="r.statusKey">{{ STATUS_LABEL[r.statusKey] }}</span></td>
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
</style>
