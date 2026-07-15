// PDF 导出专用多语言字典（自包含，不依赖应用 i18n 接线）
// 覆盖：版本名 / 语言名 / 元信息字段 / 行程字段 / 报价列 / 类型 / 页脚
// 说明：行程正文（用户输入的中文）默认不强制翻译；如配置了 VITE_TMT_ENDPOINT
// 翻译服务，正文会被翻译；否则保留中文（与 PRD「默认中文填写，AI 翻译引擎自动翻译」一致）。

export type PdfLang = 'zh' | 'th' | 'en' | 'bilingual'
export type PdfVersion = 'agency' | 'tourist' | 'internal'

type Dict = Record<string, string>

const zh: Dict = {
  version_agency: '旅行社版',
  version_tourist: '游客版',
  version_internal: '内部版（含成本价）',
  lang_zh: '中文',
  lang_th: '泰语',
  lang_en: '英文',
  lang_bilingual: '中泰双语对照',
  customer: '客户',
  destination: '目的地',
  travelDate: '出行日期',
  groupSize: '人数',
  status: '状态',
  version: '版本',
  generatedAt: '生成时间',
  itineraryTitle: '行程安排（按天）',
  day: '第',
  dayUnit: '天',
  city: '城市',
  spots: '景点',
  hotel: '住宿',
  meals: '餐饮',
  quoteTitle: '报价明细',
  col_type: '项目',
  col_cost1: '成本价①',
  col_cost2: '成本价②',
  col_agencyQuote: '对旅行社报价',
  col_markup: '旅行社加价',
  col_guestPrice: '对游客报价',
  col_notes: '备注',
  col_totals: '合计',
  type_vehicle: '包车',
  type_hotel: '酒店',
  type_ticket: '门票',
  type_meal: '餐饮',
  type_other: '其他',
  footer_internal: '内部机密文件 · 含全部成本价，请勿外传',
  footer_agency: '仅供合作旅行社参考 · 不含成本价与一手利润',
  footer_tourist: '仅供游客参考 · 含对游客报价',
  noQuote: '暂无报价明细',
}

const th: Dict = {
  version_agency: 'ฉบับตัวแทน',
  version_tourist: 'ฉบับนักท่องเที่ยว',
  version_internal: 'ฉบับภายใน (รวมต้นทุน)',
  lang_zh: 'จีน',
  lang_th: 'ไทย',
  lang_en: 'อังกฤษ',
  lang_bilingual: 'จีน-ไทย คู่ขนาน',
  customer: 'ลูกค้า',
  destination: 'จุดหมาย',
  travelDate: 'วันเดินทาง',
  groupSize: 'จำนวนคน',
  status: 'สถานะ',
  version: 'เวอร์ชัน',
  generatedAt: 'เวลาสร้าง',
  itineraryTitle: 'กำหนดการเดินทาง (รายวัน)',
  day: 'วันที่',
  dayUnit: 'วัน',
  city: 'เมือง',
  spots: 'สถานที่ท่องเที่ยว',
  hotel: 'ที่พัก',
  meals: 'อาหาร',
  quoteTitle: 'รายละเอียดราคา',
  col_type: 'รายการ',
  col_cost1: 'ต้นทุน①',
  col_cost2: 'ต้นทุน②',
  col_agencyQuote: 'ราคาให้ตัวแทน',
  col_markup: 'กำไรเพิ่ม',
  col_guestPrice: 'ราคาให้ลูกค้า',
  col_notes: 'หมายเหตุ',
  col_totals: 'รวม',
  type_vehicle: 'รถ',
  type_hotel: 'โรงแรม',
  type_ticket: 'ตั๋ว',
  type_meal: 'อาหาร',
  type_other: 'อื่นๆ',
  footer_internal: 'เอกสารลับภายใน · รวมต้นทุนทั้งหมด ห้ามเผยแพร่',
  footer_agency: 'สำหรับตัวแทนเท่านั้น · ไม่รวมต้นทุนและกำไร',
  footer_tourist: 'สำหรับลูกค้าเท่านั้น · รวมราคาให้ลูกค้า',
  noQuote: 'ไม่มีรายการราคา',
}

const en: Dict = {
  version_agency: 'Agency Version',
  version_tourist: 'Tourist Version',
  version_internal: 'Internal Version (with cost)',
  lang_zh: 'Chinese',
  lang_th: 'Thai',
  lang_en: 'English',
  lang_bilingual: 'Chinese-Thai Bilingual',
  customer: 'Customer',
  destination: 'Destination',
  travelDate: 'Travel Date',
  groupSize: 'Group Size',
  status: 'Status',
  version: 'Version',
  generatedAt: 'Generated At',
  itineraryTitle: 'Itinerary (by day)',
  day: 'Day',
  dayUnit: '',
  city: 'City',
  spots: 'Attractions',
  hotel: 'Hotel',
  meals: 'Meals',
  quoteTitle: 'Quote Details',
  col_type: 'Item',
  col_cost1: 'Cost①',
  col_cost2: 'Cost②',
  col_agencyQuote: 'Agency Quote',
  col_markup: 'Agency Markup',
  col_guestPrice: 'Guest Price',
  col_notes: 'Notes',
  col_totals: 'Total',
  type_vehicle: 'Vehicle',
  type_hotel: 'Hotel',
  type_ticket: 'Ticket',
  type_meal: 'Meal',
  type_other: 'Other',
  footer_internal: 'INTERNAL CONFIDENTIAL · contains all costs, do not distribute',
  footer_agency: 'For partner agency only · excludes costs and profit',
  footer_tourist: 'For tourist only · includes guest price',
  noQuote: 'No quote details',
}

const DICTS: Record<'zh' | 'th' | 'en', Dict> = { zh, th, en }

// bilingual 的界面标签使用泰语（中泰双语对照）
function dictOf(lang: PdfLang): Dict {
  if (lang === 'zh') return zh
  if (lang === 'en') return en
  return th // th / bilingual 都用泰语标签
}

export function t(lang: PdfLang, key: string): string {
  const d = dictOf(lang)
  return d[key] ?? zh[key] ?? key
}

export const PDF_LANG_OPTIONS: { value: PdfLang; label: string }[] = [
  { value: 'zh', label: '中文' },
  { value: 'th', label: '泰语' },
  { value: 'bilingual', label: '中泰双语对照' },
  { value: 'en', label: '英文' },
]

export const PDF_VERSION_LABEL: Record<PdfVersion, string> = {
  agency: '旅行社版（含对旅行社报价，不含成本/利润）',
  tourist: '游客版（含对游客报价）',
  internal: '内部版（含全部成本价）',
}
