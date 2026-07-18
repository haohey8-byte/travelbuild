// 报价计算纯函数（前后端共用同一套规则，见后端 role-visibility.ts）
// 两层数据流：
//   PandaKing 层：  报价A = 成本① + 利润1（元/%）
//   境外旅行社层：  对客价 = 报价A + 利润2（元/%）
import type { QuoteLevel, ProfitMode } from '@/types'

// 利润折算：金额直接加；百分比按基准（成本①）折算
export function profitToAmount(base: number, mode: ProfitMode | undefined, value: number | undefined): number {
  const v = Number(value) || 0
  return mode === 'percent' ? base * (v / 100) : v
}

// 行级 PandaKing 报价A = 成本① + 利润1（元直接加，% 按成本折算）
export function itemQuoteA(it: QuoteLevel): number {
  const cost1 = Number(it.cost1) || 0
  const profit1 = Number(it.profit1) || 0
  return it.profit1Mode === 'percent' ? cost1 * (1 + profit1 / 100) : cost1 + profit1
}

// 由 items 派生的 PandaKing 层合计（成本① / 利润1 / 报价A）
export function calcDerived(items: QuoteLevel[]): { cost1: number; profit1: number; quoteA: number } {
  const acc = { cost1: 0, profit1: 0, quoteA: 0 }
  for (const it of items) {
    const cost1 = Number(it.cost1) || 0
    acc.cost1 += cost1
    acc.profit1 += profitToAmount(cost1, it.profit1Mode, it.profit1)
    acc.quoteA += itemQuoteA(it)
  }
  return acc
}

// 对客价 = 报价A + 利润2（金额直接加；百分比折算为金额）
export function calcGuestPrice(quoteA: number, mode: ProfitMode | undefined, value: number | undefined): number {
  const v = Number(value) || 0
  return mode === 'percent' ? quoteA * (1 + v / 100) : quoteA + v
}
