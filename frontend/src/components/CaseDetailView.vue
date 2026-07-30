<script setup lang="ts">
import { computed } from 'vue'
import CaseHtmlView from './CaseHtmlView.vue'
import { safeText } from '@/utils/name'
import type { CaseItem } from '@/types'

// 案例只读视图（公开页 + 编辑预览共用，防样式漂移）
// 渲染：联合品牌条 / hero / 亮点 / 描述 / 主体 HTML / 每日图文（只读）
const props = defineProps<{ c: CaseItem }>()

function caseTitle(): string {
  return safeText(props.c.title) || safeText(props.c.destination) || '未命名案例'
}

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
</script>

<template>
  <div class="cdv">
    <!-- 联合品牌条 -->
    <div v-if="c.agencyBranding" class="cobrand">
      <img v-if="c.agencyBranding.logoUrl" :src="c.agencyBranding.logoUrl" class="logo" alt="logo" />
      <div class="cobrand-text">
        <span class="x">PandaKing</span> × <b>{{ c.agencyBranding.name }}</b>
        <div v-if="contactList.length" class="contacts">
          <span v-for="ct in contactList" :key="ct.label" class="contact">{{ ct.label }}: {{ ct.value }}</span>
        </div>
      </div>
    </div>

    <!-- 封面 + 标题 -->
    <div class="hero" :style="c.cover ? `background-image:url(${c.cover})` : ''">
      <span v-if="!c.cover" class="hero-ph">{{ caseTitle().slice(0, 1) }}</span>
      <div class="hero-mask">
        <h1 class="title">{{ caseTitle() }}</h1>
        <div class="meta">{{ c.destination }} · {{ c.days }} 天 · {{ c.theme }} · {{ c.priceRange }}</div>
      </div>
    </div>

    <div v-if="c.highlights?.length" class="hl">
      <span v-for="h in c.highlights" :key="h" class="chip">{{ h }}</span>
    </div>

    <p v-if="c.descZh" class="desc">{{ c.descZh }}</p>

    <!-- 案例主体 HTML（沙箱 iframe 渲染） -->
    <CaseHtmlView v-if="c.contentHtml" :html="c.contentHtml" class="content-html" />

    <!-- 每日图文（只读） -->
    <section v-if="c.daysContent?.length" class="days">
      <h2>行程亮点（每日）</h2>
      <div v-for="d in c.daysContent" :key="d.day" class="day-card">
        <img v-if="d.image" :src="d.image" class="day-img" alt="" />
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
.chip { font-size: 12px; background: var(--brand-soft, #eef); color: var(--brand); border-radius: 999px; padding: 2px 8px; }
.chip.sm { font-size: 11px; }
.desc { line-height: 1.7; white-space: pre-wrap; margin: 8px 0 18px; }
.content-html { margin: 12px 0 18px; }
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
