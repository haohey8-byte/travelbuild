<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { listRouteArchives } from '@/api/routes'
import { safeName } from '@/utils/name'
import type { RouteArchive } from '@/types'

const router = useRouter()
const archives = ref<RouteArchive[]>([])
const loading = ref(true)
const err = ref('')

onMounted(async () => {
  try {
    archives.value = await listRouteArchives()
  } catch (e: any) {
    err.value = e?.response?.data?.message || '加载失败'
  } finally {
    loading.value = false
  }
})

function displayName(r: RouteArchive): string {
  const routeData = r.routeData as { customerName?: string; customerNameCn?: string; destination?: string }
  return safeName(routeData?.customerNameCn, routeData?.customerName) || routeData?.destination || r.routeId
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
      <h1 class="page-title">路线归档历史</h1>
      <button class="btn ghost" @click="router.push('/routes/kanban')">← 返回看板</button>
    </div>
    <p v-if="loading">加载中…</p>
    <p v-else-if="err" class="err">{{ err }}</p>
    <p v-else-if="!archives.length" class="muted">暂无已归档的路线。</p>
    <div v-else class="list">
      <div
        v-for="a in archives"
        :key="a.id"
        class="card archive-card"
        @click="router.push(`/route-archives/${a.id}`)"
      >
        <div class="archive-title">{{ displayName(a) }}</div>
        <div class="archive-meta">
          <span>原路线ID：{{ a.routeId }}</span>
          <span>删除人：{{ a.deletedByName || '-' }}</span>
          <span>归档时间：{{ fmtTime(a.createdAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; }
.page-title { font-size: 20px; margin: 0; }
.list { display: flex; flex-direction: column; gap: 12px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.archive-card { cursor: pointer; transition: box-shadow .2s; }
.archive-card:hover { box-shadow: 0 2px 12px rgba(0,0,0,.08); }
.archive-title { font-weight: 600; font-size: 16px; margin-bottom: 8px; }
.archive-meta { display: flex; flex-wrap: wrap; gap: 12px; color: var(--muted); font-size: 13px; }
.err { color: var(--danger); }
.muted { color: var(--muted); }
</style>
