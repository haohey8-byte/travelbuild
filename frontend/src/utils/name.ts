// 名称渲染兜底：过滤因历史测试/编码问题残留的乱码（mojibake / 替换字符 / 西里尔 / IPA 扩展等），
// 让看板、案例、详情、H5 永不显示豆腐块。

// 命中以下任一范围即视为乱码：Unicode 替换符、西里尔字母、IPA/音标扩展、组合附加符号、
// 箭头/数学/符号区（这些本不应出现在中文客户名里）
const GARBLED = /[�\uFFFD\u0400-\u04FF\u0250-\u02FF\u0300-\u036F\u2000-\u206F\u20A0-\u20CF\u2100-\u214F\u2200-\u22FF\u2C00-\u2C5F]/g

export function isGarbled(s: string | null | undefined): boolean {
  if (!s) return false
  return GARBLED.test(s)
}

// 取一个可安全展示的名称：优先中文名（若为乱码则忽略），其次英文名，最后兜底文案。
export function safeName(cn?: string | null, en?: string | null, fallback = '未命名路线'): string {
  if (cn && !isGarbled(cn) && cn.trim()) return cn.trim()
  if (en && !isGarbled(en) && en.trim()) return en.trim()
  return fallback
}

// 任意文本字段兜底（如目的地、客户名），乱码则回落到备选或空串（调用方决定是否显示占位）。
export function safeText(s?: string | null, fallback = ''): string {
  if (!s) return fallback
  return isGarbled(s) ? fallback : s
}
