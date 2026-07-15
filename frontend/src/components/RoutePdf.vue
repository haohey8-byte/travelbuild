<script setup lang="ts">
import { computed } from 'vue'
import type { PdfModel, PdfColumn } from '@/utils/pdf-model'
import { t } from '@/utils/pdf-i18n'

const props = defineProps<{ model: PdfModel }>()

function colLabel(c: PdfColumn): string {
  return t(props.model.lang, `col_${c}`)
}
function fmt(n?: number): string {
  return n == null ? '—' : '¥' + Number(n).toLocaleString()
}
function cell(it: PdfModel['quote']['items'][number], c: PdfColumn): string {
  switch (c) {
    case 'type':
      return it.typeLabel
    case 'cost1':
      return fmt(it.cost1)
    case 'cost2':
      return fmt(it.cost2)
    case 'agencyQuote':
      return fmt(it.agencyQuote)
    case 'markup':
      return fmt(it.markup)
    case 'guestPrice':
      return fmt(it.guestPrice)
    case 'notes':
      return it.notes || '—'
  }
}
function showTr(s: string): boolean {
  return props.model.lang !== 'zh' && !!s && s.trim().length > 0
}

const meta = computed(() => [
  { label: t(props.model.lang, 'customer'), value: props.model.customer },
  { label: t(props.model.lang, 'destination'), value: props.model.destination },
  { label: t(props.model.lang, 'travelDate'), value: props.model.travelDate },
  { label: t(props.model.lang, 'groupSize'), value: String(props.model.groupSize) },
  { label: t(props.model.lang, 'status'), value: props.model.status.zh },
  { label: t(props.model.lang, 'version'), value: props.model.versionLabel },
  { label: t(props.model.lang, 'generatedAt'), value: props.model.generatedAt },
])
</script>

<template>
  <div class="pdf-doc">
    <header class="pdf-head">
      <div class="pdf-brand">PandaKing9 · 入境游定制协作工作台</div>
      <h1 class="pdf-title">{{ model.title }}</h1>
      <div class="pdf-lang">{{ model.langName }}</div>
    </header>

    <section class="pdf-meta">
      <div v-for="m in meta" :key="m.label" class="pdf-meta-item">
        <span class="pdf-meta-label">{{ m.label }}</span>
        <b class="pdf-meta-value">{{ m.value }}</b>
        <span
          v-if="m.label === t(model.lang, 'status') && showTr(model.status.tr)"
          class="pdf-meta-value tr"
          >{{ model.status.tr }}</span
        >
      </div>
    </section>

    <section v-if="model.days.length" class="pdf-section">
      <h2>{{ t(model.lang, 'itineraryTitle') }}</h2>
      <div v-for="(d, i) in model.days" :key="i" class="pdf-day">
        <div class="pdf-day-h">
          {{ t(model.lang, 'day') }} {{ d.day }} {{ t(model.lang, 'dayUnit') }} ·
          {{ d.city.zh }}<span v-if="showTr(d.city.tr)" class="tr"> / {{ d.city.tr }}</span>
        </div>
        <div v-if="d.spots.some((s) => s.zh)" class="pdf-line">
          <span class="pdf-line-label">{{ t(model.lang, 'spots') }}：</span>
          <span class="pdf-line-body">
            <span v-for="(s, si) in d.spots" :key="si" class="pdf-bi">
              {{ s.zh }}<span v-if="showTr(s.tr)" class="tr"> / {{ s.tr }}</span
              ><span v-if="si < d.spots.length - 1">、</span>
            </span>
          </span>
        </div>
        <div v-if="d.hotel.zh" class="pdf-line">
          <span class="pdf-line-label">{{ t(model.lang, 'hotel') }}：</span>
          <span class="pdf-line-body"
            >{{ d.hotel.zh }}<span v-if="showTr(d.hotel.tr)" class="tr"> / {{ d.hotel.tr }}</span></span
          >
        </div>
        <div v-if="d.meals.some((m) => m.zh)" class="pdf-line">
          <span class="pdf-line-label">{{ t(model.lang, 'meals') }}：</span>
          <span class="pdf-line-body">
            <span v-for="(m, mi) in d.meals" :key="mi" class="pdf-bi">
              {{ m.zh }}<span v-if="showTr(m.tr)" class="tr"> / {{ m.tr }}</span
              ><span v-if="mi < d.meals.length - 1">、</span>
            </span>
          </span>
        </div>
      </div>
    </section>

    <section v-if="model.quote.hasQuote" class="pdf-section">
      <h2>{{ t(model.lang, 'quoteTitle') }}</h2>
      <table class="pdf-quote">
        <thead>
          <tr>
            <th v-for="c in model.quote.columns" :key="c">{{ colLabel(c) }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(it, i) in model.quote.items" :key="i">
            <td v-for="c in model.quote.columns" :key="c">{{ cell(it, c) }}</td>
          </tr>
          <tr class="pdf-totals">
            <td v-for="c in model.quote.columns" :key="c">{{ cell(model.quote.totals, c) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
    <p v-else class="pdf-empty">{{ t(model.lang, 'noQuote') }}</p>

    <footer class="pdf-foot">{{ model.footer }}</footer>
  </div>
</template>

<style scoped>
.pdf-doc {
  width: 794px;
  box-sizing: border-box;
  padding: 32px 36px;
  background: #fff;
  color: #1a1a1a;
  font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans Thai', sans-serif;
  font-size: 13px;
  line-height: 1.6;
}
.pdf-head {
  border-bottom: 2px solid #2563eb;
  padding-bottom: 10px;
  margin-bottom: 14px;
}
.pdf-brand {
  font-size: 11px;
  color: #64748b;
  letter-spacing: 0.5px;
}
.pdf-title {
  font-size: 22px;
  margin: 4px 0 2px;
  color: #0f172a;
}
.pdf-lang {
  font-size: 12px;
  color: #2563eb;
}
.pdf-meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 24px;
  margin-bottom: 18px;
}
.pdf-meta-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  border-bottom: 1px dotted #e2e8f0;
  padding-bottom: 3px;
}
.pdf-meta-label {
  color: #64748b;
  min-width: 64px;
}
.pdf-meta-value {
  font-weight: 600;
  color: #0f172a;
}
.pdf-meta-value.tr {
  font-weight: 400;
  color: #2563eb;
}
.pdf-section {
  margin-bottom: 18px;
  break-inside: avoid;
}
.pdf-section h2 {
  font-size: 15px;
  margin: 0 0 8px;
  color: #0f172a;
  border-left: 4px solid #2563eb;
  padding-left: 8px;
}
.pdf-day {
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px 10px;
  margin-bottom: 8px;
  break-inside: avoid;
}
.pdf-day-h {
  font-weight: 700;
  margin-bottom: 4px;
}
.pdf-line {
  margin: 2px 0;
}
.pdf-line-label {
  color: #64748b;
}
.pdf-bi .tr,
.pdf-day-h .tr,
.pdf-meta-value.tr {
  color: #2563eb;
}
.pdf-quote {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.pdf-quote th,
.pdf-quote td {
  border: 1px solid #cbd5e1;
  padding: 6px 8px;
  text-align: left;
}
.pdf-quote th {
  background: #f1f5f9;
  font-weight: 600;
}
.pdf-totals td {
  background: #f8fafc;
  font-weight: 700;
}
.pdf-empty {
  color: #94a3b8;
}
.pdf-foot {
  margin-top: 18px;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
  font-size: 11px;
  color: #94a3b8;
  text-align: center;
}
</style>
