<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouteStore } from '@/stores/route'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const store = useRouteStore()
const { routes, loading } = storeToRefs(store)

onMounted(() => store.load())
</script>

<template>
  <div>
    <h1 class="page-title">{{ t('nav.routes') }} · 列表</h1>
    <p v-if="loading">{{ t('common.loading') }}</p>
    <table v-else class="list-table">
      <thead>
        <tr><th>客户</th><th>目的地</th><th>版本</th><th>状态</th></tr>
      </thead>
      <tbody>
        <tr v-for="r in routes" :key="r.id">
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
.list-table { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 12px; overflow: hidden; }
.list-table th, .list-table td { padding: 10px 14px; border-bottom: 1px solid var(--line); text-align: left; }
.list-table th { background: var(--bg); font-size: 13px; color: var(--muted); }
</style>
