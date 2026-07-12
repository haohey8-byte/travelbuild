<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRouteStore } from '@/stores/route'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const router = useRouter()
const store = useRouteStore()
const { routes, loading, filterStatus } = storeToRefs(store)

const statusOptions = [
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

function open(id: string) {
  router.push(`/routes/${id}`)
}
</script>

<template>
  <div>
    <h1 class="page-title">{{ t('nav.routes') }} · 列表</h1>
    <div class="toolbar">
      <select v-model="filterStatus" class="filter">
        <option v-for="o in statusOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
      </select>
    </div>
    <p v-if="loading">{{ t('common.loading') }}</p>
    <table v-else class="list-table">
      <thead>
        <tr><th>客户</th><th>目的地</th><th>版本</th><th>状态</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in routes" :key="r.id" class="row" @click="open(r.id)">
          <td>{{ r.customerNameCn || r.customerName }}</td>
          <td>{{ r.destination }}</td>
          <td>{{ r.version }}</td>
          <td>{{ r.statusKey }}</td>
        </tr>
        <tr v-if="!routes.length"><td colspan="4">{{ t('common.empty') }}</td></tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.toolbar { margin-bottom: 12px; }
.filter { padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; }
.list-table { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 12px; overflow: hidden; }
.list-table th, .list-table td { padding: 10px 14px; border-bottom: 1px solid var(--line); text-align: left; }
.list-table th { background: var(--bg); font-size: 13px; color: var(--muted); }
.row { cursor: pointer; }
.row:hover { background: var(--brand-soft); }
</style>
