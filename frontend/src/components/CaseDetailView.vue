<script setup lang="ts">
import { computed, ref } from 'vue'
import CaseHtmlView from './CaseHtmlView.vue'
import { safeText } from '@/utils/name'
import { formatTravelDate } from '@/utils/share'
import { fixImageUrl } from '@/utils/image'
import type { CaseItem } from '@/types'

// 案例只读视图（公开页 + 编辑预览共用，防样式漂移）
// 渲染：语言切换 / 联合品牌条 / hero / 亮点 / 描述 / 主体 HTML / 每日图文（只读）
const props = defineProps<{ c: CaseItem }>()

// 多语言：中/英/泰切换（localStorage 记忆；未翻译语言回退中文）
type Locale = 'zh' | 'en' | 'th'
const locale = ref<Locale>((localStorage.getItem('case-lang') as Locale) || 'zh')
function setLocale(l: Locale) {
  locale.value = l
  try { localStorage.setItem('case-lang', l) } catch { /* */ }
}

function caseTitle(): string {
  if (locale.value === 'en' && props.c.titleEn) return safeText(props.c.titleEn)
  if (locale.value === 'th' && props.c.titleTh) return safeText(props.c.titleTh)
  return safeText(props.c.title) || safeText(props.c.destination) || '未命名案例'
}
const caseDesc = computed(() => {
  if (locale.value === 'en' && props.c.descEn) return props.c.descEn
  if (locale.value === 'th' && props.c.descTh) return props.c.descTh
  return props.c.descZh || ''
})
// 翻译署名（英文/泰文显示时告知来源；按模块化 transMeta 聚合）
const transCredit = computed(() => {
  if (locale.value === 'zh') return ''
  const meta = props.c.transMeta || {}
  const reviewedFields = Object.values(meta).filter((m: any) => m?.status === 'reviewed').length
  const totalFields = Object.keys(meta).length
  if (reviewedFields > 0 && reviewedFields === totalFields && totalFields > 0) {
    return 'Translated by AI · Human-reviewed'
  }
  if (totalFields > 0) return 'Translated by AI'
  // 无翻译元数据时根据是否有该语言 desc 判断
  const hasDesc = locale.value === 'en' ? !!props.c.descEn : !!props.c.descTh
  return hasDesc ? '' : 'Chinese original'
})

const contactList = computed(() => {
  const ct = props.c.agencyBranding?.contacts
  if (!ct) return []
  const arr: { label: string; value: string }[] = []
  if (ct.wechat) arr.push({ label: '微信', value: ct.wechat })
  if (ct.line) arr.push({ label: 'Line', value: ct.line })
  if (ct.facebook) arr.push({ label: 'Facebook', value: ct.facebook })
  if (ct.phone) arr.push({ label: '电话', value: ct.phone })
  if (ct.email) arr.push({ label: '邮箱', value: ct.email })
  return arr
})

// 行程参数（出行时间 / 人数 / 用车）：公开案例页与分享文案保持一致；均可空，无值不展示
const tripParams = computed(() => {
  const arr: { k: string; v: string }[] = []
  if (props.c.travelDate) arr.push({ k: '出行时间', v: formatTravelDate(props.c.travelDate) })
  if (props.c.groupSize) arr.push({ k: '人数', v: `${props.c.groupSize}人` })
  if (props.c.vehicle) arr.push({ k: '用车', v: safeText(props.c.vehicle) })
  return arr
})

// P2 多语言字段：按 locale 选版本，空回退中文
const caseHighlights = computed(() => {
  if (locale.value === 'en' && props.c.highlightsEn?.length) return props.c.highlightsEn
  if (locale.value === 'th' && props.c.highlightsTh?.length) return props.c.highlightsTh
  return props.c.highlights || []
})
const caseDaysContent = computed(() => {
  if (locale.value === 'en' && props.c.daysContentEn?.length) return props.c.daysContentEn as any
  if (locale.value === 'th' && props.c.daysContentTh?.length) return props.c.daysContentTh as any
  return (props.c.daysContent as any) || []
})
const caseContentHtml = computed(() => {
  if (locale.value === 'en' && props.c.contentHtmlEn) return props.c.contentHtmlEn
  if (locale.value === 'th' && props.c.contentHtmlTh) return props.c.contentHtmlTh
  return props.c.contentHtml
})
// 多语言「行程亮点」标题
const daysTitle = computed(() => {
  if (locale.value === 'en') return 'Daily Itinerary'
  if (locale.value === 'th') return 'กำหนดการเดินทาง'
  return '行程亮点（每日）'
})
</script>

<template>
  <div class="cdv">
    <!-- 语言切换（中/英/泰；HTML 微站正文不翻译，仅切换标题/描述 meta） -->
    <div class="lang-switch">
      <span
        v-for="l in (['zh', 'en', 'th'] as Locale[])"
        :key="l"
        class="lang-chip"
        :class="{ active: locale === l }"
        @click="setLocale(l)"
      >{{ l === 'zh' ? '🇨🇳 中文' : l === 'en' ? '🇺🇸 EN' : '🇹🇭 ไทย' }}</span>
    </div>

    <!-- 联合品牌条 -->
    <div v-if="c.agencyBranding" class="cobrand">
      <img v-if="c.agencyBranding.logoUrl" :src="fixImageUrl(c.agencyBranding.logoUrl)" class="logo" alt="logo" />
      <div class="cobrand-text">
        <span class="x">PandaKing</span> × <b>{{ c.agencyBranding.name }}</b>
        <div v-if="contactList.length" class="contacts">
          <span v-for="ct in contactList" :key="ct.label" class="contact">{{ ct.label }}: {{ ct.value }}</span>
        </div>
      </div>
    </div>

    <!-- 封面 + 标题 -->
    <div class="hero" :style="c.cover ? `background-image:url(${fixImageUrl(c.cover)})` : ''">
      <span v-if="!c.cover" class="hero-ph">{{ caseTitle().slice(0, 1) }}</span>
      <div class="hero-mask">
        <h1 class="title">{{ caseTitle() }}</h1>
        <div class="meta">{{ c.destination }} · {{ c.days }} 天 · {{ c.theme }} · {{ c.priceRange }}</div>
      </div>
    </div>

    <!-- 案例元数据摘要（亮点 / 行程参数 / 描述）—— 始终在 HTML 微站主体之前显示，确保运营填的字段可见 -->
    <div v-if="caseHighlights.length || tripParams.length || caseDesc" class="meta-card">
      <div v-if="caseHighlights.length" class="hl">
        <span v-for="h in caseHighlights" :key="h" class="chip">{{ h }}</span>
      </div>
      <div v-if="tripParams.length" class="params">
        <span v-for="p in tripParams" :key="p.k" class="param"><b>{{ p.k }}</b> {{ p.v }}</span>
      </div>
      <p v-if="caseDesc" class="desc">{{ caseDesc }}</p>
    <p v-if="transCredit && caseDesc" class="trans-credit">{{ transCredit }}</p>
    </div>

    <!-- 案例主体 HTML（沙箱 iframe 渲染） -->
    <CaseHtmlView v-if="caseContentHtml" :html="caseContentHtml" class="content-html" />

    <!-- 每日图文（只读） -->
    <section v-if="caseDaysContent.length" class="days">
      <h2>{{ daysTitle }}</h2>
      <div v-for="d in caseDaysContent" :key="d.day" class="day-card">
        <img v-if="d.image" :src="fixImageUrl(d.image)" class="day-img" alt="" />
        <div class="day-head">第 {{ d.day }} 天 · {{ d.city }}</div>
        <div v-if="d.spots?.length" class="day-row"><span class="k">景点</span>
          <span class="chips"><span v-for="s in d.spots" :key="s" class="chip sm">{{ s }}</span></span>
        </div>
        <div v-if="d.hotel" class="day-row"><span class="k">酒店</span><b>{{ d.hotel }}</b></div>
        <div v-if="d.meals?.length" class="day-row"><span class="k">餐饮</span>
          <span class="chips"><span v-for="m in d.meals" :key="m" class="chip sm">{{ m }}</span></span>
        </div>
        <div v-if="d.notes" class="day-notes">{{ d.notes }}</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.cobrand {
  display: flex; align-items: center; gap: 12px; padding: 10px 14px;
  background: var(--brand-soft, #eef); border-radius: 12px; margin-bottom: 12px;
}
.lang-switch { display: flex; justify-content: flex-end; gap: 6px; margin-bottom: 10px; }
.lang-chip { padding: 4px 12px; border-radius: 999px; font-size: 12px; cursor: pointer; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink-2); }
.lang-chip.active { background: var(--brand); color: #fff; border-color: var(--brand); }
.trans-credit { font-size: 11.5px; color: var(--muted); margin-top: -12px; margin-bottom: 14px; }
.cobrand .logo { width: 44px; height: 44px; border-radius: 8px; object-fit: cover; }
.cobrand .x { color: var(--brand); font-weight: 700; }
.contacts { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--muted); }
.contact { background: var(--card); border: 1px solid var(--line); border-radius: 6px; padding: 1px 6px; }
.hero {
  height: 280px; background: var(--brand-soft, var(--line)) center/cover no-repeat;
  border-radius: 14px; position: relative; display: flex; align-items: flex-end; overflow: hidden;
}
.hero-ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 64px; font-weight: 700; color: var(--brand); }
.hero-mask { width: 100%; padding: 18px; background: linear-gradient(transparent, rgba(0,0,0,.55)); color: #fff; }
.title { margin: 0; font-size: 24px; }
.meta { margin-top: 6px; opacity: .92; font-size: 14px; }
.hl { margin: 12px 0; display: flex; flex-wrap: wrap; gap: 6px; }
.params { margin: 4px 0 12px; display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 13px; color: var(--ink-2); }
.param b { color: var(--muted); font-weight: 600; margin-right: 4px; }
.chip { font-size: 12px; background: var(--brand-soft, #eef); color: var(--brand); border-radius: 999px; padding: 2px 8px; }
.chip.sm { font-size: 11px; }
.desc { line-height: 1.7; white-space: pre-wrap; margin: 8px 0 18px; }
.content-html { margin: 12px 0 18px; }
.meta-card {
  background: var(--card, #fff);
  border: 1px solid var(--line, #e8edf4);
  border-left: 3px solid var(--brand, #185FA5);
  border-radius: 12px;
  padding: 14px 16px;
  margin: 12px 0;
}
.meta-card .hl { margin: 0 0 8px; }
.meta-card .params { margin: 0 0 8px; }
.meta-card .desc { margin: 0; }
.days h2 { font-size: 18px; margin: 8px 0; }
.day-card { border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin-bottom: 10px; background: var(--card); }
.day-img { width: 100%; max-height: 220px; object-fit: cover; border-radius: 8px; margin-bottom: 8px; }
.day-head { font-weight: 600; margin-bottom: 6px; }
.day-row { display: flex; gap: 8px; align-items: flex-start; padding: 3px 0; }
.day-row .k { color: var(--muted); width: 40px; flex: none; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.day-notes { color: var(--muted); font-size: 14px; white-space: pre-wrap; margin-top: 4px; }
@media (max-width: 640px) {
  .hero { height: 200px; }
}
</style>
