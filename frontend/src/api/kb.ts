import client from './client'
import type { KbEntry } from '@/types'

// 知识库 —— 对应 doc/04-接口契约/知识库.md（读公开，写需登录）
export async function fetchKb(params?: {
  category?: string
  tag?: string
  q?: string
}): Promise<KbEntry[]> {
  const { data } = await client.get('/knowledge', { params })
  return data
}

export async function fetchKbById(id: string): Promise<KbEntry> {
  const { data } = await client.get(`/knowledge/${id}`)
  return data
}

export async function createKb(payload: {
  title: string
  category: string
  tags?: string[]
  body: string
  routeId?: string
}): Promise<KbEntry> {
  const { data } = await client.post('/knowledge', payload)
  return data
}
