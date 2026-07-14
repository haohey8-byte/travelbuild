import client from './client'
import type { Route, RouteVersion, RouteFeedbackItem } from '@/types'

// 路线与版本 —— 对应 doc/04-接口契约/路线与版本.md
export async function fetchRoutes(params?: { status?: string; role?: string }): Promise<Route[]> {
  const { data } = await client.get('/routes', { params })
  return data
}

export async function fetchRoute(id: string): Promise<Route> {
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

// 生成协作 H5 共享链接
export async function shareRoute(
  routeId: string,
  role?: string,
): Promise<{ token: string; link: string }> {
  const { data } = await client.post(`/routes/${routeId}/share`, role ? { role } : {})
  return data
}

// 状态流转动作（提交草案/确认采用/回传反馈/修订/发报价/加价/游客确认/付款/拒绝）
// 后端按角色与状态机强制校验，非法转移返回 409
export async function routeAction(
  routeId: string,
  action: string,
  body?: unknown,
): Promise<unknown> {
  const { data } = await client.post(`/routes/${routeId}/${action}`, body)
  return data
}

// 反馈记录（H5 链接反馈 + 一手回传反馈），供协作双方查看
export async function fetchRouteFeedback(routeId: string): Promise<RouteFeedbackItem[]> {
  const { data } = await client.get(`/routes/${routeId}/feedback`)
  return data
}
