import client from './client'
import type { CaseItem } from '@/types'

// 案例展示 —— 对应 doc/04-接口契约/H5协作链接.md 与 案例.md
export async function fetchCases(): Promise<CaseItem[]> {
  const { data } = await client.get('/cases')
  return data
}

// 从已确认路线派生案例（服务端做脱敏校验）
export async function createCaseFromRoute(routeId: string): Promise<CaseItem> {
  const { data } = await client.post(`/cases/from-route/${routeId}`)
  return data
}

export async function fetchCase(id: string): Promise<CaseItem> {
  const { data } = await client.get(`/cases/${id}`)
  return data
}

export async function publishCase(id: string): Promise<CaseItem> {
  const { data } = await client.post(`/cases/${id}/publish`)
  return data
}

export async function unpublishCase(id: string): Promise<CaseItem> {
  const { data } = await client.post(`/cases/${id}/unpublish`)
  return data
}

export async function updateCase(id: string, payload: Partial<CaseItem>): Promise<CaseItem> {
  const { data } = await client.put(`/cases/${id}`, payload)
  return data
}

export async function deleteCase(id: string): Promise<void> {
  await client.delete(`/cases/${id}`)
}
