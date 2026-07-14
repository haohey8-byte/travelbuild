import client from './client'
import type { H5Route, H5Feedback, RouteFeedbackItem, H5CostInquiry } from '@/types'

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

// 公开读取反馈历史（免登录，H5 页展示已提交的修改意见）
export async function fetchH5Feedback(token: string): Promise<RouteFeedbackItem[]> {
  const { data } = await client.get(`/h5/route/${token}/feedback`)
  return data
}

// 成本询价 H5（省地接社填成本①，免登录）
export async function fetchH5CostInquiry(token: string): Promise<H5CostInquiry> {
  const { data } = await client.get(`/h5/cost-inquiry/${token}`)
  return data
}

export async function submitH5CostInquiry(
  token: string,
  cost1: number,
): Promise<{ id: string; status: string; cost1: number }> {
  const { data } = await client.post(`/h5/cost-inquiry/${token}/submit`, { cost1 })
  return data
}

// 省地接社协作 H5：保存编辑后的行程（价格保留上一版，由一手在成本询价闭环回填）
export async function editH5ProvincialRoute(
  token: string,
  itinerary: unknown,
): Promise<{ version: unknown; link: string }> {
  const { data } = await client.post(`/h5/route/${token}/edit`, { itinerary })
  return data
}
