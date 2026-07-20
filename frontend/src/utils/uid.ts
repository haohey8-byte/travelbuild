// 生成报价项的稳定唯一 id，用于 Vue v-for 的 :key，避免 index 作 key 导致的
// 输入值串行/数据错位（如一手新增「9座车」成本①=0，重渲染后输入框被复用成相邻行的 4500）。
let _seq = 0
export function genUid(): string {
  const c = (globalThis as any).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  _seq += 1
  return `q_${Date.now().toString(36)}_${_seq}_${Math.random().toString(36).slice(2, 8)}`
}
