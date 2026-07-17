<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchRouteArchive } from '@/api/routes'
import { safeName, safeText } from '@/utils/name'
import type { RouteArchive } from '@/types'

const route = useRoute()
const router = useRouter()
const id = route.params.id as string

const data = ref<RouteArchive | null>(null)
const loading = ref(true)
const err = ref('')

onMounted(async () => {
  try {
    data.value = await fetchRouteArchive(id)
  } catch (e: any) {
    err.value = e?.response?.data?.message || '加载失败'
  } finally {
    loading.value = false
  }
})

function fmtJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

function fmtTime(s?: string): string {
  if (!s) return ''
  try {
    return new Date(s).toLocaleString()
  } catch {
    return s
  }
}
</script>

<template>
  <div>
    <div class="head">
      <h1 class="page-title">归档详情</h1>
      <button class="btn ghost" @click="router.push('/route-archives')">← 返回归档列表</button>
    </div>

    <p v-if="loading">加载中…</p>
    <p v-else-if="err" class="err">{{ err }}</p>

    <div v-else-if="data" class="stack">
      <section class="card">
        <h3>基本信息</h3>
        <div class="kv">
          <div><span>归档ID</span><b>{{ data.id }}</b></div>
          <div><span>原路线ID</span><b>{{ data.routeId }}</b></div>
          <div><span>删除人</span><b>{{ data.deletedByName || '-' }}</b></div>
          <div><span>归档时间</span><b>{{ fmtTime(data.createdAt) }}</b></div>
          <div v-if="data.reason"><span>删除原因</span><b>{{ data.reason }}</b></div>
        </div>
      </section>

      <section class="card">
        <h3>路线主记录快照</h3>
        <pre class="json">{{ fmtJson(data.routeData) }}</pre>
      </section>

      <section v-if="data.versions" class="card">
        <h3>版本快照</h3>
        <pre class="json">{{ fmtJson(data.versions) }}</pre>
      </section>

      <section v-if="data.costInquiries" class="card">
        <h3>成本询价快照</h3>
        <pre class="json">{{ fmtJson(data.costInquiries) }}</pre>
      </section>

      <section v-if="data.shares" class="card">
        <h3>协作 H5 令牌快照</h3>
        <pre class="json">{{ fmtJson(data.shares) }}</pre>
      </section>

      <section v-if="data.feedbacks" class="card">
        <h3>反馈记录快照</h3>
        <pre class="json">{{ fmtJson(data.feedbacks) }}</pre>
      </section>
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; }
.page-title { font-size: 20px; margin: 0; }
.stack { display: flex; flex-direction: column; gap: 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.kv { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
.kv div { display: flex; gap: 8px; }
.kv span { color: var(--muted); width: 80px; }
.json { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 12px; font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; max-height: 400px; overflow: auto; }
.err { color: var(--danger); }
</style>
