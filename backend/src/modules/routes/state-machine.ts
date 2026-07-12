// 路线协作状态机 —— 单一事实来源
// 对应 doc/02-模块拆分/路线管理.md §3「状态机」与 PRD 客户协作状态机
// statusKey 为自由字符串存储（schema 未上枚举），此处集中定义合法取值与转移表，
// service 层强制校验，非法转移抛错（controller 捕获为 409）。

export const STATUS = {
  CONSULTING: 'consulting', // 咨询中（草稿，未提交）
  AWAITING_PK_CONFIRM: 'awaiting_pk_confirm', // 待一手确认
  AWAITING_AGENCY_REVISION: 'awaiting_agency_revision', // 待旅行社修订
  AWAITING_QUOTE: 'awaiting_quote', // 待报价
  AWAITING_FEEDBACK: 'awaiting_feedback', // 待反馈（一手已发 v1，等旅行社）
  AWAITING_CONFIRM: 'awaiting_confirm', // 待确认（旅行社已加价）
  CONFIRMED: 'confirmed', // 已确认
  BOOKED: 'booked', // 已成单
  PENDING_FOLLOWUP: 'pending_followup', // 待跟进（超期）
  LOST: 'lost', // 已流失
} as const

export type StatusKey = (typeof STATUS)[keyof typeof STATUS]

// 状态转移动作
export const ACTION = {
  SUBMIT_DRAFT: 'submit_draft', // 旅行社提交草案（含修订重交）
  PK_CONFIRM: 'pk_confirm', // 一手确认采用
  PK_FEEDBACK: 'pk_feedback', // 一手回传修改反馈
  SEND_V1: 'send_v1', // 一手发报价 v1（待报价 → 待反馈）
  AGENCY_MARKUP: 'agency_markup', // 旅行社加价（待反馈 → 待确认）
  TOURIST_CONFIRM: 'tourist_confirm', // 游客确认（待确认 → 已确认）
  PAY: 'pay', // 付款（已确认 → 已成单）
  REJECT: 'reject', // 明确拒绝
  OVERDUE: 'overdue', // 超期转待跟进
} as const

export type ActionKey = (typeof ACTION)[keyof typeof ACTION]

// 转移表：动作 -> { from: 合法源状态[], to: 目标状态 }
const TRANSITIONS: Record<ActionKey, { from: StatusKey[]; to: StatusKey }> = {
  [ACTION.SUBMIT_DRAFT]: {
    from: [STATUS.CONSULTING, STATUS.AWAITING_AGENCY_REVISION],
    to: STATUS.AWAITING_PK_CONFIRM,
  },
  [ACTION.PK_CONFIRM]: {
    from: [STATUS.AWAITING_PK_CONFIRM],
    to: STATUS.AWAITING_QUOTE,
  },
  [ACTION.PK_FEEDBACK]: {
    from: [STATUS.AWAITING_PK_CONFIRM],
    to: STATUS.AWAITING_AGENCY_REVISION,
  },
  [ACTION.SEND_V1]: {
    from: [STATUS.AWAITING_QUOTE],
    to: STATUS.AWAITING_FEEDBACK,
  },
  [ACTION.AGENCY_MARKUP]: {
    from: [STATUS.AWAITING_FEEDBACK],
    to: STATUS.AWAITING_CONFIRM,
  },
  [ACTION.TOURIST_CONFIRM]: {
    from: [STATUS.AWAITING_CONFIRM],
    to: STATUS.CONFIRMED,
  },
  [ACTION.PAY]: {
    from: [STATUS.CONFIRMED],
    to: STATUS.BOOKED,
  },
  [ACTION.REJECT]: {
    from: [STATUS.AWAITING_FEEDBACK, STATUS.AWAITING_CONFIRM],
    to: STATUS.LOST,
  },
  [ACTION.OVERDUE]: {
    from: [
      STATUS.AWAITING_PK_CONFIRM,
      STATUS.AWAITING_AGENCY_REVISION,
      STATUS.AWAITING_FEEDBACK,
      STATUS.AWAITING_CONFIRM,
    ],
    to: STATUS.PENDING_FOLLOWUP,
  },
}

// 校验转移是否合法，非法返回 null（供测试/条件分支）
export function nextStatus(current: string, action: ActionKey): StatusKey | null {
  const t = TRANSITIONS[action]
  if (!t) return null
  if (!t.from.includes(current as StatusKey)) return null
  return t.to
}

// 非法转移错误（controller 捕获转为 409 Conflict）
export class InvalidTransitionError extends Error {
  constructor(
    public readonly current: string,
    public readonly action: ActionKey,
  ) {
    super(`非法状态转移: ${current} --(${action})--> ?`)
    this.name = 'InvalidTransitionError'
  }
}

// 执行转移；非法抛 InvalidTransitionError
export function applyTransition(current: string, action: ActionKey): StatusKey {
  const to = nextStatus(current, action)
  if (!to) throw new InvalidTransitionError(current, action)
  return to
}

// 启动自检：转移表目标全部合法
export function validateStateMachine(): void {
  const all = Object.values(STATUS)
  for (const t of Object.values(TRANSITIONS)) {
    if (!all.includes(t.to)) {
      throw new Error(`状态机转移目标非法: ${t.to}`)
    }
  }
}
