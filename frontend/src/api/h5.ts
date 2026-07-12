import client from './client'
import type { H5Route, H5Feedback } from '@/types'

// 协作 H5（公开，免登录） —— 对应 doc/04-接口契约/H5协作链接.md
export async function fetchH5Route(token: string): Promise<H5Route> {
  const { data } = await client.get(`/h5/route/${token}`)
  return data
}

export async function submitH5Feedback(
  token: string,
  content: string,
  authorName?: string,
): Promise<H5Feedback> {
  const { data } = await client.post(`/h5/route/${token}/feedback`, { content, authorName })
  return data
}
