import client from './client'
import type { Route, RouteVersion } from '@/types'

// 路线与版本 —— 对应 doc/04-接口契约/路线与版本.md
export async function fetchRoutes(params?: { status?: string; role?: string }): Promise<Route[]> {
  const { data } = await client.get('/routes', { params })
  return data
}

export async function fetchRoute(id: string): Promise<{ route: Route; version: RouteVersion }> {
  const { data } = await client.get(`/routes/${id}`)
  return data
}

export async function createRoute(payload: unknown): Promise<Route> {
  const { data } = await client.post('/routes', payload)
  return data
}

// 保存并通知：生成新 version
export async function saveVersion(routeId: string, payload: unknown): Promise<RouteVersion> {
  const { data } = await client.post(`/routes/${routeId}/versions`, payload)
  return data
}
