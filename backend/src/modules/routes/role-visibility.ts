// 角色字段级可见性 + 报价重算 —— 对应 PRD 权限矩阵 Q4.1–Q4.5 与 doc/04-接口契约/权限矩阵.md
// 报价统一形状：{ items: QuoteLevel[], totals: { cost1, profit1, quoteA, profit2, guestPrice } }
//   - cost1   = 省地接社成本（成本①）
//   - profit1 = 一手 PandaKing 利润（元或 %，默认 0）
//   - quoteA  = PandaKing 报价合计 = Σ(cost1 + profit1)
//   - profit2 = 境外旅行社利润（元或 %，默认 0）
//   - guestPrice = 对客总价 = profit2Mode==='percent' ? quoteA*(1+profit2/100) : quoteA+profit2
// 两层数据流：
//   PandaKing 层： 报价A = 成本① + 利润1（元/%）
//   境外旅行社层： 对客价 = 报价A + 利润2（元/%）  （旅行社的「成本」是报价A，不是省地接社成本①）
// 可见性规则：
//   - pandaking（一手）：全见 cost1/profit1/quoteA/profit2/guestPrice
//   - agency（境外旅行社）：见 quoteA/guestPrice，隐藏内部成本 cost1/profit1（也隐藏自身利润细节外的内部）
//   - provincial（省地接社）：仅见 cost1（自身成本），隐藏 PandaKing 报价与对客价（agency↔provincial 物理隔绝）
//   - 公开 H5：仅 guestPrice（maskQuotePublic）

export type Role = 'pandaking' | 'agency' | 'provincial'
export type ProfitMode = 'amount' | 'percent'

export interface QuoteLevel {
  name?: string
  type?: string
  cost1?: number
  profit1Mode?: ProfitMode
  profit1?: number
  quoteA?: number
  cost2?: number
  markup?: number
}

export interface Quote {
  items?: QuoteLevel[]
  totals?: {
    cost1?: number
    profit1?: number
    quoteA?: number
    profit2Mode?: ProfitMode
    profit2?: number
    guestPrice?: number
  }
}

// 由「利润表示方式」把利润折算为金额
function profitToAmount(base: number, mode: ProfitMode | undefined, value: number | undefined): number {
  const v = Number(value) || 0
  if (mode === 'percent') return base * (v / 100)
  return v
}

// 由 items 重算 totals，保证 totals 与 items 永远一致
// 同时回填每行 quoteA（行级 PandaKing 报价），便于前端直接展示
export function recalcQuote(quote: unknown): unknown {
  if (quote == null) return quote
  const q = quote as Quote
  const items: QuoteLevel[] = Array.isArray(q.items)
    ? q.items.map((it) => {
        const cost1 = Number(it.cost1) || 0
        const profit1Amt = profitToAmount(cost1, it.profit1Mode, it.profit1)
        const rowQuoteA = cost1 + profit1Amt
        return { ...it, cost1, profit1: Number(it.profit1) || 0, quoteA: rowQuoteA }
      })
    : []

  const cost1 = items.reduce((s, it) => s + (Number(it.cost1) || 0), 0)
  const profit1 = items.reduce((s, it) => {
    const base = Number(it.cost1) || 0
    return s + profitToAmount(base, it.profit1Mode, it.profit1)
  }, 0)
  const quoteA = cost1 + profit1

  const prev = (q.totals ?? {}) as { profit2Mode?: ProfitMode; profit2?: number }
  const profit2Mode = prev.profit2Mode ?? 'amount'
  const profit2 = Number(prev.profit2) || 0
  // 对客价 = quoteA + 利润2（金额直接加；百分比折算为金额）
  const guestPrice = profit2Mode === 'percent' ? quoteA * (1 + profit2 / 100) : quoteA + profit2

  return {
    items,
    totals: {
      cost1,
      profit1,
      quoteA,
      profit2Mode,
      profit2,
      guestPrice,
    },
  }
}

// 按角色剥离报价内部成本字段
export function hideCostsForRole(quote: unknown, role: Role): unknown {
  if (quote == null) return quote
  // 先重算，保证一致
  const recalced = recalcQuote(quote) as Quote
  if (role === 'pandaking') return recalced

  const q = recalced
  if (role === 'agency') {
    // 旅行社：成本基线 = PandaKing 报价A；可编辑利润2；可见对客价。隐藏省地接社成本与 PandaKing 利润。
    return {
      items: Array.isArray(q.items)
        ? q.items.map((it) => ({ name: it.name, type: it.type, cost1: it.quoteA }))
        : q.items,
      totals: {
        quoteA: q.totals?.quoteA,
        profit2Mode: q.totals?.profit2Mode,
        profit2: q.totals?.profit2,
        guestPrice: q.totals?.guestPrice,
      },
    }
  }
  if (role === 'provincial') {
    // 省地接社：仅见自身成本①，不可见 PandaKing 报价与对客价
    return {
      items: Array.isArray(q.items)
        ? q.items.map((it) => ({ name: it.name, type: it.type, cost1: it.cost1 }))
        : q.items,
      totals: { cost1: q.totals?.cost1 },
    }
  }
  return recalced
}

// 公开 H5 脱敏：仅保留对客总价 guestPrice
export function maskQuotePublic(quote: unknown): unknown {
  if (quote == null) return quote
  const q = recalcQuote(quote) as Quote
  return {
    items: Array.isArray(q.items)
      ? q.items.map((it) => ({ name: it.name, type: it.type, guestPrice: it.quoteA }))
      : q.items,
    totals: { guestPrice: q.totals?.guestPrice },
  }
}
