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
  // 路线归属账号名（创建者，即 PandaKing 平台方），供控制台页替代「一手」字眼显示具体账号名
  ownerName?: string | null
}

// 利润表示方式：金额(元) 或 百分比(%)。百分比以「成本」为基准。
export type ProfitMode = 'amount' | 'percent'

// 报价单行 —— 对齐 v2 原型「项目 | 成本① | 利润(元/%) | 报价A」
//   cost1   = 省地接社成本①（地接可填，PandaKing 可见）
//   profit1 = PandaKing 利润（元或%，默认 0；省地接社只填成本、利润留 0）
//   quoteA  = 行级 PandaKing 报价 = profit1Mode==='percent' ? cost1*(1+profit1/100) : cost1+profit1
export interface QuoteLevel {
  uid?: string // 前端稳定唯一 id（v-for :key），不参与后端计算，仅用于避免索引作 key 导致输入值串行
  name?: string // 项目名称可自定义（优先显示）
  type?: 'vehicle' | 'hotel' | 'ticket' | 'meal' | 'other' // 旧数据/快速分类保留
  cost1?: number // 省地接社成本（成本①）
  profit1Mode?: ProfitMode // PandaKing 利润表示（金额/百分比），默认 amount
  profit1?: number // PandaKing 利润值（默认 0）
  quoteA?: number // 行级 PandaKing 报价（可选冗余存储，便于前端直接显示）
  // 兼容旧字段（历史数据迁移期保留）：cost2=旧一手利润、markup=旧旅行社加价
  cost2?: number
  markup?: number
  guestPrice?: number // 行级/合计对客价（冗余，便于 PDF 与公开 H5 复用）
}

// 报价合计 —— 两层数据流
//   PandaKing 层：quoteA = Σ(cost1 + profit1)
//   境外旅行社层：guestPrice = profit2Mode==='percent' ? quoteA*(1+profit2/100) : quoteA+profit2
export interface Quote {
  items: QuoteLevel[]
  totals: {
    cost1?: number // Σ 成本①
    profit1?: number // Σ PandaKing 利润合计（折算成金额）
    quoteA?: number // PandaKing 报价合计 = cost1 + profit1
    profit2Mode?: ProfitMode // 境外旅行社利润表示（金额/百分比），默认 amount
    profit2?: number // 境外旅行社利润值（默认 0）
    guestPrice?: number // 对客价 = quoteA + profit2
  }
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
  phone?: string | null
  email?: string | null
  disabled?: boolean
  mustChangePwd?: boolean
}

// 管理员视图（手机号脱敏，仅 pandaking 可见）
export interface AdminView {
  id: string
  name: string
  phone: string
  disabled: boolean
  mustChangePwd: boolean
  createdAt: string
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
  // 首次强制改密：登录成功但 requireChangePwd=true 时必须跳转到 /change-pwd
  requireChangePwd?: boolean
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

// —— 协作 H5（公开只读视图 / PandaKing↔旅行社双向编辑视图） ——
export interface H5Route {
  token: string
  public?: boolean // 是否为对客公开(只读)链接；false 表示协作方可编辑链接
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
  // 双向协作回路：对端可编辑令牌（PandaKing 视图返回 agencyToken，旅行社/公开视图返回 pandakingToken）
  pandakingToken?: string | null
  agencyToken?: string | null
  // 路线归属账号名（创建者，即 PandaKing 平台方），用于 H5 内替代「一手」字眼显示具体注册名
  ownerName?: string | null
  // 净化报价：仅含对客报价（guestPrice），不含成本①/②/加价（公开 H5 不泄漏内部成本）
  // 旅行社视角（role=agency, public=false）下 totals 还会返回 quoteA/profit2Mode/profit2，便于 H5 旅行社视图加利润②
  // 一手视角（role=pandaking, public=false）下返回全量：items 含 cost1/profit1Mode/profit1/quoteA，totals 含 quoteA/profit2
  quote?: {
    items?: {
      name?: string
      type?: string
      cost1?: number
      profit1Mode?: 'amount' | 'percent'
      profit1?: number
      quoteA?: number
      guestPrice?: number | null
    }[]
    totals?: {
      guestPrice?: number | null
      cost1?: number
      profit1?: number
      quoteA?: number
      profit2Mode?: 'amount' | 'percent'
      profit2?: number
    }
  } | null
  // 仅省地接社协作 H5 返回
  costInquiry?: {
    id: string
    status: 'pending' | 'submitted'
    cost1: number | null
    costItems?: CostInquiryItem[]
    agencyName?: string | null // 被询价省地接社机构名（后端 getH5 解析，用于回传文案个性化）
  } | null
}

export interface H5Feedback {
  id: string
  content: string
  authorName?: string | null
  createdAt: string
}

// 路线反馈记录（控制台与 H5 页共用）：H5 链接反馈 + 一手回传反馈 + 控制台建议
export interface RouteFeedbackItem {
  id: string
  source: 'h5' | 'console'
  authorRole?: Role | null // 提交方角色：pandaking / agency / provincial
  authorName?: string | null
  content: string
  createdAt: string
}

export interface CostInquiryItem {
  name: string
  amount: number
}

// 成本询价（一手 ↔ 省地接社）
export interface CostInquiry {
  id: string
  routeId: string
  provincialId: string
  token?: string
  status: 'pending' | 'submitted'
  cost1: number | null
  costItems?: CostInquiryItem[]
  createdAt: string
}

// 成本询价 H5（省地接社填写成本①，免登录）
export interface H5CostInquiry {
  token: string
  status: string
  cost1: number | null
  costItems?: CostInquiryItem[]
  // 路线归属账号名（创建者，即 PandaKing 平台方），用于 H5 内替代「一手」字眼显示具体注册名
  ownerName?: string | null
  // 被询价省地接社机构名，用于回传通知文案个性化（显示为具体机构名）
  agencyName?: string | null
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

// —— 机构提交链接（route-intake）：外部旅行社免登录提交路线初稿 ——
export interface IntakeDraft {
  customerName: string
  customerNameCn?: string
  country: string
  destination: string
  groupSize: number
  travelDate?: string | null
  itinerary?: Record<string, unknown> | null
  quote?: Quote | null
}

export interface IntakeResult {
  routeId: string
  success: boolean
}

// 预发提交链接返回（PandaKing 控制台调用）
export interface IntakeLink {
  token: string
  link: string
}
