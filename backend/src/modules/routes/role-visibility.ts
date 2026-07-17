// 角色字段级可见性 —— 对应 PRD 权限矩阵 Q4.1–Q4.5 与 doc/04-接口契约/权限矩阵.md
// 报价采用统一形状：{ items: QuoteLevel[], totals: { cost1, cost2, markup, guestPrice } }
//   - cost1 = 省地接社成本（成本①）
//   - cost2 = 一手利润（成本②）
//   - markup = 旅行社加价
//   - guestPrice = 对客总价 = cost1 + cost2 + markup（仅此字段对外公开）
// 可见性规则：
//   - pandaking（一手）：全见 cost1/cost2/markup/guestPrice
//   - agency（境外旅行社）：见 markup/guestPrice，隐藏内部成本 cost1/cost2
//   - provincial（省地接社）：见 cost1/markup/guestPrice，隐藏一手利润 cost2
//   - 公开 H5：仅 guestPrice（maskQuotePublic）

export type Role = 'pandaking' | 'agency' | 'provincial'

interface QuoteLevel {
  name?: string
  type?: string
  cost1?: number
  cost2?: number
  markup?: number
  guestPrice?: number
}

interface Quote {
  items?: QuoteLevel[]
  totals?: QuoteLevel
}

// 按角色剥离报价内部成本字段
export function hideCostsForRole(quote: unknown, role: Role): unknown {
  if (quote == null) return quote

  // 一手可见全部
  if (role === 'pandaking') return quote

  const q = quote as Quote
  const strip = (level: QuoteLevel | undefined): QuoteLevel | undefined => {
    if (!level) return level
    const copy: QuoteLevel = { ...level }
    if (role === 'agency') {
      delete copy.cost1 // 旅行社不可见省地接社内部成本①
      delete copy.cost2 // 也不可见一手利润②
      // 保留 markup：旅行社可见自身加价（权限矩阵 Q4.5）
    }
    if (role === 'provincial') {
      delete copy.cost2 // 省地接社不可见一手利润②
      delete copy.markup // 省地接社不可见旅行社加价
      // 保留 cost1：省地接社可见自身成本①
    }
    return copy
  }

  return {
    ...q,
    items: Array.isArray(q.items) ? q.items.map(strip) : q.items,
    totals: strip(q.totals),
  }
}

// 公开 H5 脱敏：仅保留对客总价 guestPrice
export function maskQuotePublic(quote: unknown): unknown {
  if (quote == null) return quote
  const q = quote as Quote
  const guestPrice = q.totals?.guestPrice
  return {
    items: Array.isArray(q.items)
      ? q.items.map((it) => ({ name: it.name, type: it.type, guestPrice: it.guestPrice }))
      : q.items,
    totals: { guestPrice },
  }
}
