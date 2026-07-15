import type { QuoteLevel } from '@/types'
import { t, type PdfLang, type PdfVersion } from './pdf-i18n'
import { targetOf, translateText } from './pdf-translate'

export type PdfColumn =
  | 'type'
  | 'cost1'
  | 'cost2'
  | 'agencyQuote'
  | 'markup'
  | 'guestPrice'
  | 'notes'

export interface PdfBi {
  zh: string
  tr: string
}
export interface PdfDay {
  day: number
  city: PdfBi
  spots: PdfBi[]
  hotel: PdfBi
  meals: PdfBi[]
}
export interface PdfItem {
  type: string
  typeLabel: string
  cost1?: number
  cost2?: number
  agencyQuote?: number
  markup?: number
  guestPrice?: number
  notes?: string
}
export interface PdfModel {
  version: PdfVersion
  lang: PdfLang
  title: string
  langName: string
  customer: string
  destination: string
  travelDate: string
  groupSize: number
  status: PdfBi
  versionLabel: string
  generatedAt: string
  footer: string
  days: PdfDay[]
  quote: {
    hasQuote: boolean
    columns: PdfColumn[]
    items: PdfItem[]
    totals: PdfItem
  }
}

interface RawDay {
  day?: number
  city?: string
  spots?: string[]
  hotel?: string
  meals?: string[]
  notes?: string
}

function columnsFor(v: PdfVersion): PdfColumn[] {
  if (v === 'internal')
    return ['type', 'cost1', 'cost2', 'agencyQuote', 'markup', 'guestPrice', 'notes']
  if (v === 'agency') return ['type', 'agencyQuote', 'notes']
  return ['type', 'guestPrice', 'notes'] // tourist
}

function deriveItem(it: Partial<QuoteLevel> & { notes?: string }, lang: PdfLang): PdfItem {
  const cost1 = Number(it.cost1) || 0
  const cost2 = Number(it.cost2) || 0
  const markup = Number(it.markup) || 0
  const guestPrice = Number(it.guestPrice) || cost1 + cost2 + markup
  return {
    type: (it.type as string) || 'other',
    typeLabel: t(lang, `type_${it.type || 'other'}`),
    cost1,
    cost2,
    agencyQuote: cost1 + cost2,
    markup,
    guestPrice,
    notes: it.notes,
  }
}

interface PdfRouteInput {
  customerName: string
  customerNameCn?: string | null
  destination: string
  groupSize: number
  travelDate?: string | null
  statusKey: string
  version?: string
}

export async function buildPdfModel(opts: {
  route: PdfRouteInput
  itinerary: { days?: RawDay[] }
  quote: {
    items?: (Partial<QuoteLevel> & { notes?: string })[]
    totals?: { cost1?: number; cost2?: number; markup?: number; guestPrice?: number }
  }
  version: PdfVersion
  lang: PdfLang
  statusLabel: string
  versionLabel: string
}): Promise<PdfModel> {
  const { route, itinerary, quote, version, lang, statusLabel, versionLabel } = opts
  const target = targetOf(lang)
  const tr = (s: string) => (target ? translateText(s, target) : Promise.resolve(s))

  const rawDays = itinerary.days ?? []
  const days: PdfDay[] = await Promise.all(
    rawDays.map(async (d, i) => ({
      day: d.day ?? i + 1,
      city: { zh: d.city || '', tr: await tr(d.city || '') },
      spots: await Promise.all((d.spots ?? []).map(async (s) => ({ zh: s, tr: await tr(s) }))),
      hotel: { zh: d.hotel || '', tr: await tr(d.hotel || '') },
      meals: await Promise.all((d.meals ?? []).map(async (m) => ({ zh: m, tr: await tr(m) }))),
    })),
  )

  const items = (quote.items ?? []).map((it) => deriveItem(it, lang))
  const tot = quote.totals ?? {}
  const totals = deriveItem(
    {
      type: 'other',
      cost1: tot.cost1,
      cost2: tot.cost2,
      markup: tot.markup,
      guestPrice: tot.guestPrice,
    },
    lang,
  )
  totals.typeLabel = t(lang, 'col_totals')

  const statusTr = target ? await translateText(statusLabel, target) : statusLabel

  return {
    version,
    lang,
    title: t(lang, `version_${version}`),
    langName: t(lang, `lang_${lang}`),
    customer: route.customerNameCn || route.customerName || '',
    destination: route.destination || '',
    travelDate: route.travelDate || '',
    groupSize: route.groupSize || 0,
    status: { zh: statusLabel, tr: statusTr },
    versionLabel,
    generatedAt: new Date().toLocaleString('zh-CN'),
    footer: t(lang, `footer_${version}`),
    days,
    quote: {
      hasQuote: items.length > 0,
      columns: columnsFor(version),
      items,
      totals,
    },
  }
}
