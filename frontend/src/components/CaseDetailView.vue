<script setup lang="ts">
import { computed, ref } from 'vue'
import CaseHtmlView from './CaseHtmlView.vue'
import { safeText } from '@/utils/name'
import { formatTravelDate, copyText } from '@/utils/share'
import { fixImageUrl } from '@/utils/image'
import { contactViews } from '@/utils/contacts'
import { PANDKING_BRAND } from '@/constants/pandaking'
import type { CaseItem } from '@/types'

// 案例只读视图（公开页 + 编辑预览共用，防样式漂移）
// 渲染：语言切换 / 联合品牌条 / hero / 亮点 / 描述 / 主体 HTML / 每日图文（只读）
// locale：校对台预览语言（zh/en/th），默认 zh
const props = defineProps<{ c: CaseItem; locale?: 'zh' | 'en' | 'th' }>()

type Locale = 'zh' | 'en' | 'th'

// 公开页语言切换使用局部状态，避免影响全局导航/菜单
// 校对台可通过 locale prop 覆盖初始语言（预览同步当前校对语言）
const caseLocale = ref<Locale>(props.locale ?? 'zh')
function setLocale(l: Locale) {
  caseLocale.value = l
}

function caseTitle(): string {
  if (caseLocale.value === 'en' && props.c.titleEn) return safeText(props.c.titleEn)
  if (caseLocale.value === 'th' && props.c.titleTh) return safeText(props.c.titleTh)
  return safeText(props.c.title) || safeText(props.c.destination) || '未命名案例'
}
const caseDesc = computed(() => {
  if (caseLocale.value === 'en' && props.c.descEn) return props.c.descEn
  if (caseLocale.value === 'th' && props.c.descTh) return props.c.descTh
  return props.c.descZh || ''
})
// 翻译署名（英文/泰文显示时告知来源；按模块化 transMeta 聚合）
const transCredit = computed(() => {
  if (caseLocale.value === 'zh') return ''
  const meta = props.c.transMeta || {}
  const reviewedFields = Object.values(meta).filter((m: any) => m?.status === 'reviewed').length
  const totalFields = Object.keys(meta).length
  if (reviewedFields > 0 && reviewedFields === totalFields && totalFields > 0) {
    return '人工校对译文'
  }
  if (totalFields > 0) return 'AI 机器翻译初稿'
  const hasDesc = caseLocale.value === 'en' ? !!props.c.descEn : !!props.c.descTh
  return hasDesc ? '' : '暂无译文，显示中文原文'
})

// 有效品牌：有 agencyBranding（via 有效）用旅行社品牌；否则兜底 PandaKing9 平台品牌
// （匿名无 via 访问也必须能咨询 → 联系方式块恒渲染，修复"分享给客户无法咨询"悖论）
const effectiveBranding = computed(() => props.c.agencyBranding || PANDKING_BRAND)

const contactList = computed(() => {
  const ct = effectiveBranding.value?.contacts
  return ct ? contactViews(ct) : []
})
const copiedContact = ref('')
async function copyContact(v: string) {
  const ok = await copyText(v)
  if (ok) {
    copiedContact.value = v
    setTimeout(() => (copiedContact.value = ''), 1800)
  }
}

// 底部完整块：平台动作文案（Line=添加 / WhatsApp=发消息 / Facebook=查看主页 / 电话=拨打 / 邮箱=发送 / 其他=查看）
function contactActionLabel(p: string): string {
  switch (p) {
    case 'line':
    case 'wechat':
      return '添加'
    case 'whatsapp':
      return '发消息'
    case 'facebook':
      return '查看主页'
    case 'phone':
      return '拨打'
    case 'email':
      return '发送'
    default:
      return '查看'
  }
}

// 平台徽章：品牌色圆底 + 文本符号（不引第三方图标库）
function contactBadge(p: string): string {
  switch (p) {
    case 'line': return 'L'
    case 'whatsapp': return 'W'
    case 'facebook': return 'f'
    case 'wechat': return '微'
    case 'phone': return '☎'
    case 'email': return '✉'
    default: return p ? p[0].toUpperCase() : '•'
  }
}

// 行程参数（出行时间 / 人数 / 用车）：公开案例页与分享文案保持一致；均可空，无值不展示
const tripParams = computed(() => {
  const arr: { k: string; v: string }[] = []
  if (props.c.travelDate) arr.push({ k: '出行时间', v: formatTravelDate(props.c.travelDate) })
  if (props.c.groupSize) arr.push({ k: '人数', v: `${props.c.groupSize}人` })
  if (props.c.vehicle) arr.push({ k: '用车', v: safeText(props.c.vehicle) })
  return arr
})

// P2 多语言字段：按 caseLocale 选版本，空回退中文
const caseHighlights = computed(() => {
  if (caseLocale.value === 'en' && props.c.highlightsEn?.length) return props.c.highlightsEn
  if (caseLocale.value === 'th' && props.c.highlightsTh?.length) return props.c.highlightsTh
  return props.c.highlights || []
})
const caseDaysContent = computed(() => {
  if (caseLocale.value === 'en' && props.c.daysContentEn?.length) return props.c.daysContentEn as any
  if (caseLocale.value === 'th' && props.c.daysContentTh?.length) return props.c.daysContentTh as any
  return (props.c.daysContent as any) || []
})
const caseContentHtml = computed(() => {
  if (caseLocale.value === 'en' && props.c.contentHtmlEn) return props.c.contentHtmlEn
  if (caseLocale.value === 'th' && props.c.contentHtmlTh) return props.c.contentHtmlTh
  return props.c.contentHtml
})
</script>

<template>
  <div class="cdv">
    <!-- 语言切换（仅切换案例正文内容，不影响全局菜单） -->
    <div class="lang-switch">
      <span
        v-for="l in (['zh', 'en', 'th'] as Locale[])"
        :key="l"
        class="lang-chip"
        :class="{ active: caseLocale === l }"
        @click="setLocale(l)"
      >{{ l === 'zh' ? '中文' : l === 'en' ? 'English' : 'ไทย' }}</span>
    </div>

    <!-- 品牌条（白标：有 agency 时仅展示机构自身 Logo + 名称 + 联系方式，不出现 PandaKing9；无 agency 兜底 PandaKing9 平台） -->
    <div v-if="effectiveBranding" class="cobrand">
      <img v-if="effectiveBranding.logoUrl" :src="fixImageUrl(effectiveBranding.logoUrl)" class="logo" alt="logo" />
      <div class="cobrand-text">
        <b>{{ effectiveBranding.name }}</b>
        <div v-if="contactList.length" class="contacts">
          <template v-for="(ct, i) in contactList" :key="i" class="contact">
            <a v-if="ct.href" :href="ct.href" class="contact-link" target="_blank" rel="noopener">{{ ct.label }}: {{ ct.value }}</a>
            <span v-else class="contact">
              {{ ct.label }}: {{ ct.value }}
              <button v-if="ct.copyable" type="button" class="ct-copy" @click="copyContact(ct.value)">{{ copiedContact === ct.value ? '已复制 ✓' : '复制' }}</button>
            </span>
          </template>
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

    <!-- 案例元数据摘要（亮点 / 行程参数 / 描述） -->
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
      <h2>行程亮点</h2>
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

    <!-- 底部完整联系方式块（白标：有 agency 显示旅行社；无 agency 兜底 PandaKing9 平台，客户滚动到底直接联系） -->
    <div v-if="effectiveBranding" class="cdv-contact">
      <div class="cdv-contact-hd">
        <img
          v-if="effectiveBranding.logoUrl"
          :src="fixImageUrl(effectiveBranding.logoUrl)"
          class="cdv-contact-logo"
          alt="logo"
        />
        <span v-else class="cdv-contact-logo fb">{{ (effectiveBranding.name || '?').slice(0, 1) }}</span>
        <div class="cdv-contact-meta">
          <div class="cdv-contact-name">{{ effectiveBranding.name }}</div>
          <div class="cdv-contact-tip">联系定制本行程</div>
        </div>
      </div>
      <div v-if="contactList.length" class="cdv-contact-list">
        <a
          v-for="(ct, i) in contactList"
          :key="i"
          class="cdv-contact-item"
          :class="'pf-' + ct.platform"
          :href="ct.href || undefined"
          :target="ct.href ? '_blank' : undefined"
          :rel="ct.href ? 'noopener' : undefined"
          @click="!ct.href && ct.copyable && copyContact(ct.value)"
        >
          <span class="cdv-badge">{{ contactBadge(ct.platform) }}</span>
          <span class="cdv-body">
            <span class="cdv-plat">{{ ct.label }}</span>
            <span class="cdv-val">{{ ct.value }}</span>
          </span>
          <span v-if="ct.copyable" class="cdv-act">{{ copiedContact === ct.value ? '已复制 ✓' : '复制' }}</span>
          <span v-else-if="ct.href" class="cdv-act">{{ contactActionLabel(ct.platform) }} ›</span>
        </a>
      </div>
    </div>

    <!-- 底部落款：白标规则 — 有 agency 仅机构名；无 agency 显示 PandaKing9 兜底 -->
    <div v-if="c.agencyBranding" class="cdv-foot"><span class="fn">{{ c.agencyBranding.name }}</span></div>
    <div v-else class="cdv-foot"><b>PandaKing9</b> · 定制旅行</div>
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
.contact-link { color: var(--brand-600); text-decoration: none; word-break: break-all; }
.contact-link:hover { text-decoration: underline; }
.ct-copy { margin-left: 4px; padding: 0 6px; font-size: 11px; border: 1px solid var(--line-strong); border-radius: 4px; background: var(--surface); color: var(--ink-2); cursor: pointer; font-family: inherit; }
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
.cdv-foot { text-align: center; color: var(--muted); font-size: 12.5px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); line-height: 1.6; }
.cdv-foot .fn { color: var(--ink); font-weight: 700; }
.cdv-foot .brand9 { color: var(--brand); font-weight: 700; }

/* 底部完整联系方式块（高端化：柔和阴影 + 平台色徽章 + 行卡片 + 操作胶囊） */
.cdv-contact {
  margin-top: 26px;
  border: 1px solid rgba(24, 95, 165, .08);
  border-radius: 18px;
  padding: 22px 24px;
  background: var(--card, #fff);
  box-shadow: 0 8px 30px rgba(24, 95, 165, .07);
}
.cdv-contact-hd { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
.cdv-contact-logo {
  width: 56px; height: 56px; border-radius: 16px; object-fit: cover;
  background: var(--brand-soft, #eef); box-shadow: 0 2px 8px rgba(24, 95, 165, .1);
}
.cdv-contact-logo.fb {
  display: flex; align-items: center; justify-content: center;
  font-size: 24px; font-weight: 700; color: var(--brand);
}
.cdv-contact-name { font-size: 17px; font-weight: 700; letter-spacing: -.01em; }
.cdv-contact-tip { font-size: 12.5px; color: var(--muted); margin-top: 3px; }
.cdv-contact-list { display: flex; flex-direction: column; gap: 10px; }
.cdv-contact-item {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 14px; border-radius: 14px;
  border: 1px solid var(--line, #e8edf4); background: var(--surface, #fff);
  text-decoration: none; color: inherit; cursor: pointer;
  transition: transform .18s cubic-bezier(.16, 1, .3, 1), box-shadow .18s, border-color .18s;
}
.cdv-contact-item:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--pf, #185fa5) 35%, transparent);
  box-shadow: 0 4px 14px rgba(24, 95, 165, .08);
}
.cdv-badge {
  width: 36px; height: 36px; border-radius: 50%; flex: none;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; font-weight: 700; color: #fff;
  background: var(--pf, #185fa5);
}
/* 平台品牌色映射 */
.pf-line { --pf: #00b900; }
.pf-whatsapp { --pf: #25d366; }
.pf-facebook { --pf: #1877f2; }
.pf-wechat { --pf: #07c160; }
.pf-phone { --pf: #185fa5; }
.pf-email { --pf: #e8590c; }
.cdv-body { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.cdv-plat { font-size: 11px; color: var(--muted); font-weight: 600; letter-spacing: .04em; text-transform: uppercase; }
.cdv-val { font-size: 14px; color: var(--ink, #1c2430); font-weight: 600; word-break: break-all; margin-top: 1px; }
.cdv-act {
  flex: none; font-size: 12.5px; font-weight: 600;
  color: var(--pf, #185fa5); padding: 5px 12px; border-radius: 999px;
  background: color-mix(in srgb, var(--pf, #185fa5) 10%, transparent);
  transition: background .15s;
}
.cdv-contact-item:hover .cdv-act { background: color-mix(in srgb, var(--pf, #185fa5) 18%, transparent); }

/* 移动端：紧凑适配 */
@media (max-width: 480px) {
  .cdv-contact { padding: 16px 14px; }
  .cdv-contact-logo { width: 46px; height: 46px; border-radius: 12px; }
  .cdv-badge { width: 32px; height: 32px; font-size: 13px; }
  .cdv-val { font-size: 13px; }
  .cdv-act { padding: 4px 10px; font-size: 12px; }
}
</style>
