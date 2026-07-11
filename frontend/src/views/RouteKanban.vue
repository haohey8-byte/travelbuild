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
    <h1 class="page-title">{{ t('nav.routes') }} · 看板</h1>
    <p v-if="loading">{{ t('common.loading') }}</p>
    <div v-else class="kanban-grid">
      <div v-for="r in routes" :key="r.id" class="card">
        <div class="route-name">{{ r.customerNameCn || r.customerName }}</div>
        <div class="route-meta">{{ r.destination }} · {{ r.version }} · {{ r.statusKey }}</div>
      </div>
      <p v-if="!routes.length">{{ t('common.empty') }}</p>
    </div>
  </div>
</template>

<style scoped>
.kanban-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.route-name { font-weight: 600; }
.route-meta { color: var(--muted); font-size: 13px; margin-top: 4px; }
</style>
