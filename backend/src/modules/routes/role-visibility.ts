// 角色字段级可见性 —— 对应 PRD 权限矩阵 Q4.1–Q4.5 与 doc/04-接口契约/权限矩阵.md
// 成本①(cost1)/成本②(cost2)/利润(profit) 仅「一手 PandaKing」可见；
// 境外旅行社 / 省地接社 仅见游客侧报价（含其自身加价），不暴露内部成本。

export type Role = 'pandaking' | 'agency' | 'provincial'

// 剥离报价中的内部成本字段（cost1/cost2/profit）
export function hideCostsForRole(quote: unknown, role: Role): unknown {
  if (role === 'pandaking' || quote == null) return quote

  const q = quote as Record<string, unknown>
  const stripItem = (item: Record<string, unknown>) => {
    const copy = { ...item }
    delete copy.cost1
    delete copy.cost2
    delete copy.profit
    return copy
  }

  return {
    ...q,
    items: Array.isArray(q.items)
      ? (q.items as Record<string, unknown>[]).map(stripItem)
      : q.items,
    totals: q.totals
      ? stripItem(q.totals as Record<string, unknown>)
      : q.totals,
  }
}
