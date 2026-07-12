<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchRoute, shareRoute } from '@/api/routes'
import type { Route } from '@/types'

const { t } = useI18n()
const route = useRoute()
const id = route.params.id as string

const tab = ref<'itinerary' | 'quote' | 'customer'>('itinerary')
const data = ref<Route | null>(null)
const loading = ref(true)
const err = ref('')
const shareLink = ref('')
const copying = ref(false)

const tabs = [
  { key: 'itinerary', label: '行程' },
  { key: 'quote', label: '报价' },
  { key: 'customer', label: '客户信息' },
] as const

onMounted(async () => {
  try {
    data.value = await fetchRoute(id)
  } catch (e: any) {
    err.value = e?.response?.data?.message || t('common.error')
  } finally {
    loading.value = false
  }
})

async function onShare() {
  copying.value = true
  try {
    const res = await shareRoute(id)
    shareLink.value = `${location.origin}${res.link}`
    await navigator.clipboard.writeText(shareLink.value)
  } catch {
    /* ignore */
  } finally {
    copying.value = false
  }
}
</script>

<template>
  <div>
    <p v-if="loading">{{ t('common.loading') }}</p>
    <p v-else-if="err" class="err">{{ err }}</p>
    <template v-else-if="data">
      <h1 class="page-title">
        {{ data.customerNameCn || data.customerName }}
        <span class="sub">{{ data.destination }} · {{ data.statusKey }}</span>
      </h1>

      <div class="actions">
        <button class="btn btn-primary" :disabled="copying" @click="onShare">
          {{ shareLink ? '复制协作链接' : '生成协作 H5 链接' }}
        </button>
        <a v-if="shareLink" :href="shareLink" target="_blank" class="link">打开 H5 ↗</a>
      </div>

      <div class="tab-bar">
        <button
          v-for="tb in tabs"
          :key="tb.key"
          :class="['tab', { active: tab === tb.key }]"
          @click="tab = tb.key"
        >{{ tb.label }}</button>
      </div>

      <div class="card tab-body">
        <pre v-if="tab === 'itinerary'" class="json">{{ JSON.stringify(data.versions?.[0]?.itinerary ?? {}, null, 2) }}</pre>
        <div v-else-if="tab === 'quote'">
          <p v-if="!data.versions?.length" class="muted">{{ t('common.empty') }}</p>
          <table v-else class="quote-table">
            <thead><tr><th>类型</th><th>对客价</th></tr></thead>
            <tbody>
              <tr v-for="(it, i) in (data.versions[0]?.quote?.items ?? [])" :key="i">
                <td>{{ it.type }}</td>
                <td>¥{{ (it.guestPrice ?? 0).toLocaleString() }}</td>
              </tr>
              <tr class="total"><td>合计</td><td>¥{{ ((data.versions[0]?.quote?.totals?.guestPrice) ?? 0).toLocaleString() }}</td></tr>
            </tbody>
          </table>
        </div>
        <div v-else class="kv">
          <div><span>客户</span><b>{{ data.customerNameCn || data.customerName }}</b></div>
          <div><span>国家</span><b>{{ data.country }}</b></div>
          <div><span>旅行社</span><b>{{ data.agency }}</b></div>
          <div><span>人数</span><b>{{ data.groupSize }}</b></div>
          <div><span>出行日期</span><b>{{ data.travelDate ? new Date(data.travelDate).toLocaleDateString() : '-' }}</b></div>
          <div><span>模式</span><b>{{ data.modeKey }}</b></div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.sub { font-size: 14px; color: var(--muted); margin-left: 10px; font-weight: 400; }
.actions { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.link { color: var(--info); text-decoration: none; font-size: 14px; }
.tab-bar { display: flex; gap: 8px; margin-bottom: 12px; }
.tab { padding: 8px 16px; border: 1px solid var(--line); background: var(--card); border-radius: 8px; cursor: pointer; }
.tab.active { color: var(--brand); border-color: var(--brand); }
.tab-body { min-height: 200px; }
.json { background: var(--bg); border-radius: 10px; padding: 12px; font-size: 13px; white-space: pre-wrap; word-break: break-word; }
.muted { color: var(--muted); }
.err { color: var(--danger); }
.quote-table { width: 100%; border-collapse: collapse; }
.quote-table th, .quote-table td { padding: 8px 12px; border-bottom: 1px solid var(--line); text-align: left; }
.quote-table .total td { font-weight: 700; }
.kv { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
.kv div { display: flex; gap: 8px; }
.kv span { color: var(--muted); width: 72px; }
</style>
