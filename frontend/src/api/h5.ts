import client from './client'
import type { H5Route, H5Feedback, RouteFeedbackItem, CostInquiryItem } from '@/types'

// 协作 H5（公开，免登录） —— 对应 doc/04-接口契约/H5协作链接.md
export async function fetchH5Route(token: string): Promise<H5Route> {
  const { data } = await client.get(`/h5/route/${token}`)
  return data
}

export async function submitH5Feedback(
  token: string,
  content: string,
  authorName?: string,
  authorRole?: string,
): Promise<H5Feedback> {
  const { data } = await client.post(`/h5/route/${token}/feedback`, { content, authorName, authorRole })
  return data
}

// 公开读取反馈历史（免登录，H5 页展示已提交的修改意见）
export async function fetchH5Feedback(token: string): Promise<RouteFeedbackItem[]> {
  const { data } = await client.get(`/h5/route/${token}/feedback`)
  return data
}

// 省地接社协作 H5：保存编辑后的行程并提交成本①（可单独或一起提交）
export async function editH5ProvincialRoute(
  token: string,
  payload: { itinerary?: unknown; items?: { name: string; cost1: number }[] },
): Promise<{ version: unknown | null; costInquiry: { id: string; status: string; cost1: number | null; costItems?: CostInquiryItem[] }; link: string }> {
  const { data } = await client.post(`/h5/route/${token}/edit`, payload)
  return data
}

// 旅行社协作 H5：凭 token 保存加价（利润②），免登录鉴权（对应后端 POST /h5/route/:token/quote）
export async function submitH5AgencyQuote(
  token: string,
  payload: { profit2Mode: 'amount' | 'percent'; profit2: number },
): Promise<{ quoteA: number | null; guestPrice: number | null; quote: { items?: any[]; totals?: any } }> {
  const { data } = await client.post(`/h5/route/${token}/quote`, payload)
  return data
}

// PandaKing 协作 H5：凭 pandaking 令牌全量编辑行程 + 价格（成本①+利润①+利润②），
// 免登录鉴权（对应后端 POST /h5/route/:token/pandaking-edit），提交后生成新版本并同步对端令牌。
export async function submitH5PandakingEdit(
  token: string,
  payload: { itinerary?: unknown; quote?: unknown },
): Promise<{
  version: { version: string; itinerary?: unknown; quote?: unknown } | null
  quote: { items?: any[]; totals?: any } | null
  agencyToken?: string | null
  provincialToken?: string | null
  guestPrice?: number | null
}> {
  const { data } = await client.post(`/h5/route/${token}/pandaking-edit`, payload)
  return data
}

// PandaKing 协作 H5：凭 pandaking 令牌直接分配/改派省地接社（免登录，对应后端
// POST /h5/route/:token/pandaking-assign-provincial）。移动端枢纽也要能直接分配而不仅回控制台。
// 返回刷新后的完整 H5 视图（与 getH5 一致），便于前端直接刷新枢纽状态条、机构下拉与对端令牌。
export async function assignProvincialByToken(
  token: string,
  provincialId: string,
): Promise<H5Route> {
  const { data } = await client.post(`/h5/route/${token}/pandaking-assign-provincial`, { provincialId })
  return data
}

// 境外旅行社协作 H5：凭 agency 令牌编辑行程 + 利润②（成本①不可见/不可改），
// 免登录鉴权（对应后端 POST /h5/route/:token/agency-edit），提交后生成新版本并同步对端令牌。
export async function submitH5AgencyEdit(
  token: string,
  payload: { itinerary?: unknown; profit2Mode: 'amount' | 'percent'; profit2: number },
): Promise<{
  version: { version: string; itinerary?: unknown; quote?: unknown } | null
  quote: { items?: any[]; totals?: any } | null
  pandakingToken?: string | null
  guestPrice?: number | null
}> {
  const { data } = await client.post(`/h5/route/${token}/agency-edit`, payload)
  return data
}
