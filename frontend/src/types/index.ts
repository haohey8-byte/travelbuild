// 全局类型 —— 对应 doc/04 接口契约实体
export type Role = 'pandaking' | 'agency' | 'provincial'

export type RouteStatusKey =
  | 'consulting'            // 咨询中（草稿，未提交）
  | 'awaiting_pk_confirm'   // 待一手确认（旅行社已发草案）
  | 'awaiting_agency_revision' // 待旅行社修订（一手回传反馈）
  | 'awaiting_quote'        // 待报价
  | 'awaiting_feedback'     // 待反馈
  | 'awaiting_confirm'      // 待确认
  | 'confirmed'             // 已确认
  | 'booked'                // 已成单
  | 'pending_followup'      // 待跟进（超期）
  | 'lost'                  // 已流失

export interface Route {
  id: string
  customerName: string
  customerNameCn?: string
  country: string
  agency: string
  destination: string
  groupSize: number
  travelDate: string | null
  statusKey: RouteStatusKey
  modeKey: 'collab' | 'solo'
  agencyId?: string | null
  provincialId?: string | null
  version?: string
  lastAction?: string
  versions?: RouteVersion[]
}

export interface QuoteLevel {
  type: 'vehicle' | 'hotel' | 'ticket' | 'meal' | 'other'
  cost1?: number // 省地接社成本（成本①）
  cost2?: number // 一手利润（成本②）
  markup?: number // 旅行社加价
  guestPrice?: number // = cost1 + cost2 + markup（对客总价）
}

export interface Quote {
  items: QuoteLevel[]
  totals: { cost1?: number; cost2?: number; markup?: number; guestPrice?: number }
}

export interface RouteVersion {
  id: string
  version: string
  draft: boolean
  itinerary: Record<string, unknown>
  quote: Quote | null
  createdAt: string
}

export interface User {
  id: string
  name: string
  role: Role
  agencyId?: string | null
  level?: 'admin' | 'staff'
  email?: string | null
  disabled?: boolean
}

export interface Agency {
  id: string
  name: string
  role: Role
  contact?: string | null
  createdAt: string
}

// 邀请（两层级邀请模型）
export interface Invite {
  id: string
  token: string
  role: Role
  agencyId: string | null
  level: 'admin' | 'staff'
  email?: string | null
  accepted: boolean
  expiresAt: string
}

export interface LoginResult {
  token: string
  user: User
}

export interface CaseItem {
  id: string
  routeId?: string | null
  title?: string
  cover?: string
  customerName?: string | null
  customerNameCn?: string | null
  destination: string
  days: number
  theme: string
  themeTags?: string[]
  highlights?: string[]
  priceRange: string
  refPriceRange?: string
  compliant?: boolean
  status: 'published' | 'draft' | 'offline' | 'unpublished'
  createdAt?: string
  publishedAt?: string | null
}

// —— 协作 H5（公开只读视图） ——
export interface H5Route {
  token: string
  routeId: string
  customerName?: string | null
  customerNameCn?: string | null
  destination: string
  groupSize: number
  travelDate: string | null
  version: string
  statusKey: string
  role: Role
  itinerary: Record<string, unknown>
  guestPrice: number | null
  // 净化报价：仅含对客报价（guestPrice），不含成本①/②/加价（公开 H5 不泄漏内部成本）
  quote?: {
    items?: { type: string; guestPrice: number | null }[]
    totals?: { guestPrice: number | null }
  } | null
  // 仅省地接社协作 H5 返回
  costInquiry?: {
    id: string
    status: 'pending' | 'submitted'
    cost1: number | null
  } | null
}

export interface H5Feedback {
  id: string
  content: string
  authorName?: string | null
  createdAt: string
}

// 路线反馈记录（控制台与 H5 页共用）：H5 链接反馈 + 一手回传反馈
export interface RouteFeedbackItem {
  id: string
  source: 'h5' | 'console'
  authorName?: string | null
  content: string
  createdAt: string
}

// 成本询价（一手 ↔ 省地接社）
export interface CostInquiry {
  id: string
  routeId: string
  provincialId: string
  token?: string
  status: 'pending' | 'submitted'
  cost1: number | null
  createdAt: string
}

// 成本询价 H5（省地接社填写成本①，免登录）
export interface H5CostInquiry {
  token: string
  status: string
  cost1: number | null
  route: {
    id: string
    customerName?: string | null
    customerNameCn?: string | null
    destination: string
    groupSize: number
    travelDate: string | null
  }
}

// 路线归档历史（一手删除路线时的备份快照）
export interface RouteArchive {
  id: string
  routeId: string
  routeData: object
  versions?: object
  shares?: object
  feedbacks?: object
  costInquiries?: object
  deletedById?: string | null
  deletedByName?: string | null
  reason?: string | null
  createdAt: string
}

// 省地接社协作 H5 令牌（一手生成，省地接社打开可编辑分配给自己的行程）
export interface ProvincialShare {
  token: string
  link: string
}

// 权限矩阵（后端返回，前端渲染字段级可见性）
export interface PermissionMatrix {
  fields: { field: string; pandaking: string; agency: string; provincial: string }[]
  roles: Role[]
}

export interface KbEntry {
  id: string
  title: string
  category: string
  tags: string[]
  body: string
  routeId?: string | null
  createdAt: string
  updatedAt: string
}
