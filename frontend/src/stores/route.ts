import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchRoutes } from '@/api/routes'
import type { Route } from '@/types'

async function retry<T>(fn: () => Promise<T>, retries = 3, baseDelay = 2000): Promise<T> {
  let lastErr: any
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e: any) {
      lastErr = e
      // 仅对网络超时 / 5xx 错误重试；4xx 不重试
      const status = e?.response?.status
      if (status >= 400 && status < 500) throw e
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, baseDelay * (i + 1)))
      }
    }
  }
  throw lastErr
}

// 路线列表状态（看板/列表共用）
export const useRouteStore = defineStore('route', () => {
  const routes = ref<Route[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const filterStatus = ref<string>('all')

  async function load() {
    loading.value = true
    error.value = null
    try {
      routes.value = await retry(() =>
        fetchRoutes({
          status: filterStatus.value === 'all' ? undefined : filterStatus.value,
        }),
      )
    } catch (e: any) {
      error.value = e?.response?.data?.message || e?.message || '加载失败'
      console.error('加载路线列表失败:', e)
    } finally {
      loading.value = false
    }
  }

  return { routes, loading, error, filterStatus, load }
})
