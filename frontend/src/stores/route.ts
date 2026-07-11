import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchRoutes } from '@/api/routes'
import type { Route } from '@/types'

// 路线列表状态（看板/列表共用）
export const useRouteStore = defineStore('route', () => {
  const routes = ref<Route[]>([])
  const loading = ref(false)
  const filterStatus = ref<string>('all')

  async function load() {
    loading.value = true
    try {
      routes.value = await fetchRoutes({
        status: filterStatus.value === 'all' ? undefined : filterStatus.value,
      })
    } finally {
      loading.value = false
    }
  }

  return { routes, loading, filterStatus, load }
})
