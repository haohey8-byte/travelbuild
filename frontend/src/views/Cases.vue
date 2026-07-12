<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { fetchCases, createCaseFromRoute, publishCase, unpublishCase } from '@/api/cases'
import { useAuthStore } from '@/stores/auth'
import type { CaseItem } from '@/types'

const { t } = useI18n()
const auth = useAuthStore()
const { user } = storeToRefs(auth)

const list = ref<CaseItem[]>([])
const loading = ref(true)
const routeId = ref('')
const busy = ref(false)

onMounted(load)

async function load() {
  loading.value = true
  try {
    list.value = await fetchCases()
  } finally {
    loading.value = false
  }
}

async function onDerive() {
  if (!routeId.value.trim()) return
  busy.value = true
  try {
    await createCaseFromRoute(routeId.value.trim())
    routeId.value = ''
    await load()
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
</script>

<template>
  <div>
    <h1 class="page-title">{{ t('nav.cases') }}</h1>

    <div v-if="user" class="card manage">
      <p class="muted">管理：从已确认路线派生脱敏案例（服务端强制合规校验）</p>
      <div class="derive">
        <input v-model="routeId" class="field" placeholder="已确认路线 ID" />
        <button class="btn btn-primary" :disabled="busy" @click="onDerive">派生案例</button>
      </div>
    </div>

    <p v-if="loading">{{ t('common.loading') }}</p>
    <div v-else class="case-grid">
      <div v-for="c in list" :key="c.id" class="card">
        <div class="case-title">{{ c.destination }} · {{ c.days }} 天</div>
        <div class="case-meta">{{ c.theme }}</div>
        <div class="case-price">{{ c.priceRange }}</div>
        <div class="case-status" :class="c.status">{{ c.status }}</div>
        <div v-if="user" class="case-actions">
          <button v-if="c.status !== 'published'" class="btn" @click="onPublish(c.id)">发布</button>
          <button v-else class="btn" @click="onUnpublish(c.id)">下线</button>
        </div>
      </div>
      <p v-if="!list.length" class="muted">{{ t('common.empty') }}</p>
    </div>
  </div>
</template>

<style scoped>
.manage { margin-bottom: 14px; }
.muted { color: var(--muted); font-size: 13px; }
.derive { display: flex; gap: 8px; margin-top: 8px; }
.field { flex: 1; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
.case-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.case-title { font-weight: 600; }
.case-meta { color: var(--muted); font-size: 13px; margin: 4px 0; }
.case-price { color: var(--brand); font-weight: 600; }
.case-status { font-size: 12px; color: var(--muted); margin-top: 4px; }
.case-status.published { color: var(--ok); }
.case-status.offline { color: var(--danger); }
.case-actions { margin-top: 8px; }
</style>
