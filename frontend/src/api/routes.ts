import client from './client'
import type {
  Route,
  RouteVersion,
  RouteFeedbackItem,
  CostInquiry,
  ProvincialShare,
  RouteArchive,
  IntakeDraft,
  IntakeResult,
  IntakeLink,
  IntakeLinkView,
} from '@/types'

// 一手查看已删除路线的归档快照（列表 / 详情）
export async function listRouteArchives(): Promise<RouteArchive[]> {
  const { data } = await client.get('/route-archives')
  return data
}

export async function fetchRouteArchive(id: string): Promise<RouteArchive> {
  const { data } = await client.get(`/route-archives/${id}`)
  return data
}

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

// 一手删除路线：后端先归档快照到 RouteArchive 备份历史库，再硬删（仅一手 PandaKing 可操作）
export async function deleteRoute(id: string): Promise<{ id: string; archived: boolean }> {
  const { data } = await client.delete(`/routes/${id}`)
  return data
}

// ===== 机构提交链接（route-intake）=====
// PandaKing 预发常驻提交链接（钉死 agencyId，30 天过期）
export async function createIntakeLink(agencyId: string): Promise<IntakeLink> {
  const { data } = await client.post('/routes/intake-link', { agencyId })
  return data
}

// 机构凭链接免登录提交路线初稿（ShareTokenGuard 校验 token+过期）
export async function submitIntake(token: string, draft: IntakeDraft): Promise<IntakeResult> {
  const { data } = await client.post('/routes/intake', { token, ...draft })
  return data
}

// 已生成提交链接列表（PandaKing 控制台「复制历史」管理）
export async function listIntakeLinks(): Promise<IntakeLinkView[]> {
  const { data } = await client.get('/routes/intake-links')
  return data
}

// 复制计数（复制历史）：自增 copies + 写最近复制时间
export async function copyIntakeLink(token: string): Promise<{ copies: number; lastCopiedAt: string | null }> {
  const { data } = await client.post(`/routes/intake-link/${token}/copy`)
  return data
}

// 保存并通知：生成新 version
export async function saveVersion(routeId: string, payload: unknown): Promise<RouteVersion> {
  const { data } = await client.post(`/routes/${routeId}/versions`, payload)
  return data
}

// 生成协作 H5 共享链接
// - role: 'agency' | 'pandaking' | 'provincial' —— 一手分享给旅行社时传 'agency'
// - isPublic: true = 公开(对客)只读 SSR 页（仅暴露对客价 guestPrice）；false = 内部交互页（按 role 可见性）
export async function shareRoute(
  routeId: string,
  role?: string,
  isPublic?: boolean,
): Promise<{ token: string; link: string }> {
  const body: Record<string, unknown> = {}
  if (role) body.role = role
  if (isPublic !== undefined) body.public = isPublic
  const { data } = await client.post(`/routes/${routeId}/share`, body)
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

// 反馈记录（H5 链接反馈 + 一手回传反馈 + 控制台建议），供协作双方查看
export async function fetchRouteFeedback(routeId: string): Promise<RouteFeedbackItem[]> {
  const { data } = await client.get(`/routes/${routeId}/feedback`)
  return data
}

// 控制台协作反馈：境外旅行社 / 省地接社 在详情页把建议提交给一手 PandaKing（不触发状态流转）
export async function submitConsoleFeedback(
  routeId: string,
  content: string,
  authorName?: string,
  authorRole?: string,
): Promise<RouteFeedbackItem> {
  const { data } = await client.post(`/routes/${routeId}/feedback-console`, {
    content,
    authorName,
    authorRole,
  })
  return data
}

// 一手将路线分配给省地接社（分配后该省地接社可见并参与协作）
export async function assignProvincial(routeId: string, provincialId: string): Promise<Route> {
  const { data } = await client.post(`/routes/${routeId}/assign-provincial`, { provincialId })
  return data
}

// 一手向省地接社发起成本询价 → 返回 H5 链接（复制发微信群）
export async function createCostInquiry(
  routeId: string,
  provincialId: string,
): Promise<{ id: string; token: string; link: string }> {
  const { data } = await client.post(`/routes/${routeId}/cost-inquiry`, { provincialId })
  return data
}

// 成本询价列表（按权限隔离：一手全部；省地接社仅本机构）
export async function listCostInquiries(routeId?: string): Promise<CostInquiry[]> {
  const { data } = await client.get('/cost-inquiries', { params: routeId ? { routeId } : undefined })
  return data
}

// 一手将询价成本①写入路线报价
export async function applyCostInquiry(inquiryId: string): Promise<{ ok: boolean }> {
  const { data } = await client.post(`/cost-inquiries/${inquiryId}/apply`)
  return data
}

// 一手发起「省地接社协作 H5」：一次操作完成分配 + 发起成本询价，返回统一协作链接
export async function createProvincialShare(
  routeId: string,
  provincialId?: string,
): Promise<ProvincialShare> {
  const { data } = await client.post(`/routes/${routeId}/provincial-share`, provincialId ? { provincialId } : {})
  return data
}

// 幂等获取「省地接社协作 H5」令牌：同 route + 省地接社 复用已有令牌，不重复创建
export async function ensureProvincialShare(
  routeId: string,
  provincialId?: string,
): Promise<ProvincialShare> {
  const { data } = await client.post(`/routes/${routeId}/provincial-share/ensure`, provincialId ? { provincialId } : {})
  return data
}

// 幂等获取「境外旅行社协作 H5」令牌：同 route 复用已有令牌，不重复创建。
// 一手在控制台「回传反馈 / 状态通知」时生成旅行社可编辑链接，形成多轮往返闭环。
export async function ensureAgencyShare(
  routeId: string,
): Promise<{ token: string; link: string }> {
  const { data } = await client.post(`/routes/${routeId}/agency-share/ensure`, {})
  return data
}

// 幂等获取「一手（PandaKing）协作 H5」令牌：同 route 复用已有令牌，不重复创建。
// 境外旅行社在控制台「提交建议 / 状态通知」时生成一手可编辑链接，对称形成多轮往返闭环。
export async function ensurePandakingShare(
  routeId: string,
): Promise<{ token: string; link: string }> {
  const { data } = await client.post(`/routes/${routeId}/pandaking-share/ensure`, {})
  return data
}
