// 全局类型 —— 对应 doc/04 接口契约实体
export type Role = 'pandaking' | 'agency' | 'provincial'

export type RouteStatusKey =
  | 'awaiting_pk_confirm'   // 待一手确认（旅行社已发草案）
  | 'awaiting_agency_revision' // 待旅行社修订（一手回传反馈）
  | 'awaiting_quote'        // 待报价
  | 'awaiting_feedback'     // 待反馈
  | 'awaiting_confirm'      // 待确认
  | 'confirmed'             // 已确认
  | 'lost'                  // 已流失

export interface Route {
  id: string
  customerName: string
  customerNameCn?: string
  country: string
  agency: string
  destination: string
  groupSize: number
  travelDate: string
  statusKey: RouteStatusKey
  modeKey: 'collab' | 'solo'
  version: string
  lastAction?: string
}

export interface QuoteLevel {
  type: 'vehicle' | 'hotel' | 'ticket' | 'meal' | 'other'
  cost1: number // 省地接社成本（成本①）
  cost2: number // 一手利润（成本②）
  markup: number // 旅行社加价
  guestPrice: number // = cost1 + cost2 + markup
}

export interface Quote {
  levels: QuoteLevel[]
  totalCost1: number
  totalCost2: number
  totalMarkup: number
  totalGuestPrice: number
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
  agencyId?: string
}

export interface CaseItem {
  id: string
  destination: string
  days: number
  theme: string
  priceRange: string
  status: 'published' | 'draft' | 'offline'
}
