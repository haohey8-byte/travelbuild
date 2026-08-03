<script setup lang="ts">
/**
 * ReviewWorkbench — 翻译校对台（3 栏）
 * 左：单元清单 + 状态点
 * 中：当前单元（中文源在上 灰底只读 → 目标语在下 可编辑）
 * 右：CaseDetailView 实时预览（当前校对语言）
 *
 * 一语言一屏：顶部 EN/TH 切换 Tab
 * 字段级保存：每单元独立「保存本单元」→ emit save-unit
 * 微站：文本片段抽取 → 逐片段改 → 应用到微站
 */
import { computed, ref, watch } from 'vue'
import CaseDetailView from './CaseDetailView.vue'
import { extractSegments, applySegments, zhParallel, type HtmlSegment } from '@/utils/htmlSegments'
import type { CaseItem, DayContent } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────
export interface ReviewFormState {
  titleEn: string
  titleTh: string
  descEn: string
  descTh: string
  highlightsEn: string[]
  highlightsTh: string[]
  daysContentEn: DayContent[]
  daysContentTh: DayContent[]
  contentHtmlEn: string
  contentHtmlTh: string
}

type Lang = 'en' | 'th'

/**
 * 翻译单元类型
 * title        标题
 * desc         简介
 * highlights   亮点
 * day-0,...    每日行程（逐天一个单元）
 * html         微站
 */
type UnitType = 'title' | 'desc' | 'highlights' | 'html'
type DayUnitKey = `day-${number}`
type UnitKey = UnitType | DayUnitKey

interface UnitEntry {
  key: UnitKey
  label: string
  /** 中文源字段名路径（用于取 c 上的值） */
  zhField: string
  /** 目标字段名尾缀（en/th） */
  fieldSuffix: string
  /** 用于 transMeta 审计的模块名 */
  metaModule: string
  /** 每日行程 dayIndex（仅 day-* 单元有） */
  dayIndex?: number
}

// ─── Props / Emits ───────────────────────────────────────────────────────────
const props = defineProps<{
  c: CaseItem
  modelValue: ReviewFormState
}>()

const emit = defineEmits<{
  'save-unit': [unit: string, payload: Record<string, unknown>]
  'update:modelValue': [v: ReviewFormState]
}>()

// ─── 内部状态 ────────────────────────────────────────────────────────────────
const activeLang = ref<Lang>('en')
const activeUnit = ref<UnitKey>('title')
const segmentEdits = ref<Record<number, string>>({}) // 微站片段暂存 index→文本
const segmentApplied = ref(false) // 「应用到微站」是否已执行
const savingUnit = ref<UnitKey | null>(null)
const highlightInput = ref('') // 亮点输入暂存
const spotInputs = ref<Record<string, string>>({}) // 每日行程景点输入暂存，key="day-{i}-{j 为新增时用 *}"

// ─── 语言后缀 ────────────────────────────────────────────────────────────────
const suffix = computed(() => (activeLang.value === 'en' ? 'En' : 'Th'))
const otherSuffix = computed(() => (activeLang.value === 'en' ? 'Th' : 'En'))

// ─── 翻译单元清单 ────────────────────────────────────────────────────────────
const units = computed<UnitEntry[]>(() => {
  const list: UnitEntry[] = [
    { key: 'title', label: '标题', zhField: 'title', fieldSuffix: suffix.value, metaModule: 'title' },
    { key: 'desc', label: '简介', zhField: 'descZh', fieldSuffix: suffix.value, metaModule: 'desc' },
    { key: 'highlights', label: '亮点', zhField: 'highlights', fieldSuffix: suffix.value, metaModule: 'highlights' },
  ]

  // 每日行程：逐天一个单元
  const src = (props.modelValue as any)[`daysContent${suffix.value}`] as DayContent[]
  if (Array.isArray(src)) {
    src.forEach((_d, i) => {
      list.push({
        key: `day-${i}` as DayUnitKey,
        label: `第 ${i + 1} 天`,
        zhField: `daysContent[${i}]`,
        fieldSuffix: suffix.value,
        metaModule: 'daysContent',
        dayIndex: i,
      })
    })
  }

  list.push({ key: 'html', label: '微站', zhField: 'contentHtml', fieldSuffix: suffix.value, metaModule: 'contentHtml' })

  return list
})

// ─── 每单元状态点 ────────────────────────────────────────────────────────────
function unitStatus(u: UnitEntry): 'reviewed' | 'ai' | 'empty' {
  const meta = (props.c.transMeta || {}) as Record<string, any>
  if (meta[u.metaModule]?.status === 'reviewed') return 'reviewed'
  // 判断字段是否有值
  const key = u.key === 'title' ? `title${suffix.value}` : u.key === 'desc' ? `desc${suffix.value}` : u.key === 'highlights' ? `highlights${suffix.value}` : u.key === 'html' ? `contentHtml${suffix.value}` : ''
  const val = key ? (props.modelValue as any)[key] : undefined
  if (u.key.startsWith('day-')) {
    const arr = (props.modelValue as any)[`daysContent${suffix.value}`] as DayContent[]
    const d = arr?.[u.dayIndex!]
    const hasAny = d && (d.city || d.spots?.length || d.hotel || d.notes)
    return hasAny ? 'ai' : 'empty'
  }
  if (u.key === 'highlights') {
    const arr = val as string[] | undefined
    return arr?.length ? 'ai' : 'empty'
  }
  if (u.key === 'html') {
    return (val as string) ? 'ai' : 'empty'
  }
  return (val as string) ? 'ai' : 'empty'
}

// ─── 进度 ────────────────────────────────────────────────────────────────────
const progress = computed(() => {
  const all = units.value.filter((u) => {
    // 无中文源的模块不计入
    if (u.key === 'desc' && !props.c.descZh) return false
    if (u.key === 'highlights' && !props.c.highlights?.length) return false
    if (u.key === 'html' && !props.c.contentHtml) return false
    if (u.key.startsWith('day-')) {
      const d = props.c.daysContent?.[u.dayIndex!]
      if (!d || (!d.city && !d.spots?.length && !d.hotel && !d.notes)) return false
    }
    return true
  })
  const reviewed = all.filter((u) => unitStatus(u) === 'reviewed')
  return { done: reviewed.length, total: all.length, pct: all.length ? Math.round((reviewed.length / all.length) * 100) : 0 }
})

// ─── 中文源值 ────────────────────────────────────────────────────────────────
function zhValue(u: UnitEntry): string | string[] {
  const c = props.c as any
  if (u.key === 'title') return c.title || ''
  if (u.key === 'desc') return c.descZh || ''
  if (u.key === 'highlights') return c.highlights || []
  if (u.key === 'html') return c.contentHtml || ''
  if (u.key.startsWith('day-')) {
    const d = c.daysContent?.[u.dayIndex!]
    return d ? { city: d.city || '', spots: d.spots || [], hotel: d.hotel || '', notes: d.notes || '' } as any : ''
  }
  return ''
}

// ─── 表单读写辅助 ────────────────────────────────────────────────────────────
function getField(u: UnitEntry): any {
  const m = props.modelValue as any
  if (u.key === 'title') return m[`title${u.fieldSuffix}`] || ''
  if (u.key === 'desc') return m[`desc${u.fieldSuffix}`] || ''
  if (u.key === 'highlights') return m[`highlights${u.fieldSuffix}`] || []
  if (u.key === 'html') return (m as any)[`contentHtml${u.fieldSuffix}`] || ''
  if (u.key.startsWith('day-')) {
    const arr = m[`daysContent${u.fieldSuffix}`] as DayContent[]
    return arr?.[u.dayIndex!] || null
  }
  return ''
}

function setField(u: UnitEntry, val: any) {
  const m = { ...props.modelValue } as any
  if (u.key === 'title') m[`title${u.fieldSuffix}`] = val
  else if (u.key === 'desc') m[`desc${u.fieldSuffix}`] = val
  else if (u.key === 'highlights') m[`highlights${u.fieldSuffix}`] = val
  else if (u.key === 'html') m[`contentHtml${u.fieldSuffix}`] = val
  else if (u.key.startsWith('day-')) {
    const arr = [...(m[`daysContent${u.fieldSuffix}`] || [])] as DayContent[]
    if (u.dayIndex! < arr.length) {
      arr[u.dayIndex!] = { ...arr[u.dayIndex!], ...val }
    }
    m[`daysContent${u.fieldSuffix}`] = arr
  }
  emit('update:modelValue', m as ReviewFormState)
}

// ─── 亮点操作 ────────────────────────────────────────────────────────────────
function addHighlight() {
  const raw = highlightInput.value.trim()
  if (!raw) return
  const items = raw.split(/[,，、;；]+/).map((s) => s.trim()).filter(Boolean)
  const cur = getField(units.value.find((u) => u.key === 'highlights')!) as string[]
  const newArr = [...cur]
  for (const it of items) {
    if (!newArr.includes(it)) newArr.push(it)
  }
  const u = units.value.find((u) => u.key === 'highlights')!
  setField(u, newArr)
  highlightInput.value = ''
}
function removeHighlight(i: number) {
  const u = units.value.find((u) => u.key === 'highlights')!
  const cur = getField(u) as string[]
  setField(u, cur.filter((_, idx) => idx !== i))
}

// ─── 每日行程：景点操作 ──────────────────────────────────────────────────────
function dayField(u: UnitEntry, field: string, val: any) {
  const cur = getField(u) || {}
  setField(u, { ...cur, [field]: val })
}
function addSpot(u: UnitEntry) {
  const raw = (spotInputs.value[u.key] || '').trim()
  if (!raw) return
  const cur = getField(u) as DayContent
  const spots = [...(cur.spots || [])]
  if (!spots.includes(raw)) spots.push(raw)
  setField(u, { ...cur, spots })
  spotInputs.value[u.key] = ''
}
function removeSpot(u: UnitEntry, i: number) {
  const cur = getField(u) as DayContent
  setField(u, { ...cur, spots: (cur.spots || []).filter((_, idx) => idx !== i) })
}

// ─── 微站片段 ────────────────────────────────────────────────────────────────
const htmlSegments = computed(() => {
  const u = units.value.find((u) => u.key === 'html')
  if (!u) return []
  const html = getField(u) as string
  return extractSegments(html)
})
const zhSegments = computed(() => {
  const html = props.c.contentHtml
  return html ? extractSegments(html) : []
})

function applyHtmlSegments() {
  const u = units.value.find((u) => u.key === 'html')
  if (!u) return
  const html = getField(u) as string
  const updates = new Map<number, string>()
  for (const [k, v] of Object.entries(segmentEdits.value)) {
    if (v !== undefined && v !== htmlSegments.value[Number(k)]?.text) {
      updates.set(Number(k), v)
    }
  }
  if (updates.size === 0) return
  const newHtml = applySegments(html, updates)
  setField(u, newHtml)
  segmentEdits.value = {}
  segmentApplied.value = true
  setTimeout(() => (segmentApplied.value = false), 2000)
}

// ─── 机翻基线 ────────────────────────────────────────────────────────────────
/** 当前单元的机翻基线是否适合展示（字段有 AI 值 且 transMeta 未标记 reviewed） */
function showAiBaseline(u: UnitEntry): boolean {
  const meta = (props.c.transMeta || {}) as Record<string, any>
  if (meta[u.metaModule]?.status === 'reviewed') return false
  const val = getField(u)
  if (u.key === 'highlights') return (val as string[])?.length > 0
  if (u.key === 'html') return !!(val as string)
  if (u.key.startsWith('day-')) {
    const d = val as DayContent | null
    return !!(d && (d.city || d.spots?.length || d.hotel || d.notes))
  }
  return !!(val as string)
}

// ─── 保存当前单元 ────────────────────────────────────────────────────────────
async function saveCurrentUnit() {
  const u = units.value.find((u) => u.key === activeUnit.value)
  if (!u || savingUnit.value) return

  let payload: Record<string, unknown> = {}
  if (u.key === 'title') {
    payload[`title${u.fieldSuffix}`] = getField(u) || undefined
  } else if (u.key === 'desc') {
    payload[`desc${u.fieldSuffix}`] = getField(u) || undefined
  } else if (u.key === 'highlights') {
    payload[`highlights${u.fieldSuffix}`] = getField(u)
  } else if (u.key === 'html') {
    payload[`contentHtml${u.fieldSuffix}`] = getField(u) || undefined
  } else if (u.key.startsWith('day-')) {
    // 提交当前语言全部每天（后端需要完整数组）
    const all = (props.modelValue as any)[`daysContent${u.fieldSuffix}`] as DayContent[]
    payload[`daysContent${u.fieldSuffix}`] = all
  }

  savingUnit.value = u.key
  emit('save-unit', u.key, payload)

  // 重置 savingUnit 由父组件在 onSaveUnit 完成后通过 watch c 触发，这里设超时兜底
  setTimeout(() => { savingUnit.value = null }, 5000)
}

// 父组件保存成功后清除 saving 状态
watch(
  () => props.c.transMeta,
  () => { savingUnit.value = null },
  { deep: true },
)

// ─── 常量 ───────────────────────────────────────────────────────────────────
const statusIcons: Record<string, string> = {
  reviewed: '●',
  ai: '🤖',
  empty: '○',
}

// ─── 切换语言时重置 activeUnit ───────────────────────────────────────────────
watch(activeLang, () => {
  activeUnit.value = 'title'
  segmentEdits.value = {}
  segmentApplied.value = false
})
</script>

<template>
  <div class="workbench">
    <!-- ═══ 顶部：EN/TH 切换 + 进度 ═══ -->
    <div class="wb-top">
      <div class="wb-tabs">
        <button :class="{ active: activeLang === 'en' }" class="wb-tab" @click="activeLang = 'en'">English</button>
        <button :class="{ active: activeLang === 'th' }" class="wb-tab" @click="activeLang = 'th'">ไทย</button>
      </div>
      <div class="wb-progress">
        <span class="wb-progress-text">
          已校对 {{ progress.done }}/{{ progress.total }}
          <template v-if="progress.total"> · {{ progress.pct }}%</template>
        </span>
        <div class="wb-progress-bar">
          <div class="wb-progress-fill" :style="{ width: progress.pct + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- ═══ 3 栏主体 ═══ -->
    <div class="wb-body">
      <!-- ═══ 左栏：翻译单元清单 ═══ -->
      <div class="wb-left">
        <div class="wb-unit-list">
          <button
            v-for="u in units"
            :key="u.key"
            :class="['wb-unit', { active: activeUnit === u.key }]"
            @click="activeUnit = u.key"
          >
            <span class="wb-unit-dot" :class="unitStatus(u)">{{ statusIcons[unitStatus(u)] }}</span>
            <span class="wb-unit-label">{{ u.label }}</span>
          </button>
        </div>
      </div>

      <!-- ═══ 中栏：当前单元编辑器 ═══ -->
      <div class="wb-center">
        <template v-for="u in units" :key="u.key">
          <div v-if="activeUnit === u.key" class="wb-editor">
            <!-- 中文源（灰底只读） -->
            <div class="wb-source">
              <div class="wb-source-hd">中文原文</div>
              <!-- 标题/简介 字符串源 -->
              <template v-if="u.key === 'title' || u.key === 'desc'">
                <div class="wb-source-text">{{ zhValue(u) || '（无）' }}</div>
              </template>
              <!-- 亮点 chips 源 -->
              <template v-else-if="u.key === 'highlights'">
                <div class="chips-ro">
                  <span v-for="(h, i) in (zhValue(u) as string[])" :key="i" class="chip-ro">{{ h }}</span>
                  <span v-if="!(zhValue(u) as string[]).length" class="muted">（无）</span>
                </div>
              </template>
              <!-- 每日行程源 -->
              <template v-else-if="u.key.startsWith('day-')">
                <div class="day-src">{{ (zhValue(u) as any).city ? '城市：' + (zhValue(u) as any).city : '' }}</div>
                <div v-if="(zhValue(u) as any).spots?.length" class="chips-ro">
                  <span v-for="(s, i) in (zhValue(u) as any).spots" :key="i" class="chip-ro">{{ s }}</span>
                </div>
                <div class="day-src">{{ (zhValue(u) as any).hotel ? '酒店：' + (zhValue(u) as any).hotel : '' }}</div>
                <div class="day-src muted">{{ (zhValue(u) as any).notes || '（无备注）' }}</div>
              </template>
              <!-- 微站源：中文片段参考 -->
              <template v-else-if="u.key === 'html'">
                <p class="muted" style="font-size:11px; margin-bottom:4px">⚠️ 中文片段仅供参考，与目标语言片段不一定一一对应</p>
                <div v-for="(seg, i) in zhSegments" :key="i" class="html-seg-ref">
                  <span class="html-seg-idx">{{ i + 1 }}</span>
                  {{ seg.text }}
                </div>
                <p v-if="!zhSegments.length" class="muted">（无中文微站）</p>
              </template>
            </div>

            <div class="wb-divider"></div>

            <!-- 目标语编辑器 -->
            <div class="wb-target">
              <div class="wb-target-hd">
                <span>{{ activeLang === 'en' ? 'English' : 'ไทย' }} 译文</span>
                <button
                  v-if="showAiBaseline(u)"
                  class="wb-ai-btn"
                  @click="() => {
                    /* AI 基线已在字段中显示，无需额外操作；按钮仅作状态提示 */
                  }"
                >
                  🤖 AI 初稿待校
                </button>
              </div>

              <!-- 标题 -->
              <template v-if="u.key === 'title'">
                <input class="wb-input" :value="getField(u) as string" :placeholder="'请输入' + (activeLang==='en'?'English':'ไทย') + ' 标题'" @input="setField(u, ($event.target as HTMLInputElement).value)" />
              </template>

              <!-- 简介 -->
              <template v-else-if="u.key === 'desc'">
                <textarea class="wb-textarea" :value="getField(u) as string" :placeholder="'请输入' + (activeLang==='en'?'English':'ไทย') + ' 简介'" rows="6" @input="setField(u, ($event.target as HTMLTextAreaElement).value)"></textarea>
              </template>

              <!-- 亮点标签 -->
              <template v-else-if="u.key === 'highlights'">
                <div class="chips-edit">
                  <span v-for="(h, i) in (getField(u) as string[])" :key="i" class="ce-chip">
                    {{ h }} <button type="button" class="ce-x" @click="removeHighlight(i)">×</button>
                  </span>
                  <input
                    v-model="highlightInput"
                    class="ce-input"
                    :placeholder="(activeLang==='en'?'English':'ไทย') + ' highlights, Enter'"
                    @keydown.enter.prevent="addHighlight"
                  />
                </div>
              </template>

              <!-- 每日行程 -->
              <template v-else-if="u.key.startsWith('day-')">
                <div class="day-edit-row">
                  <label class="day-edit-k">城市</label>
                  <input class="wb-input" :value="((getField(u) as DayContent)?.city || '')" :placeholder="'城市名'" @input="dayField(u, 'city', ($event.target as HTMLInputElement).value)" />
                </div>
                <div class="day-edit-row">
                  <label class="day-edit-k">景点</label>
                  <div class="day-spots">
                    <span v-for="(s, i) in ((getField(u) as DayContent)?.spots || [])" :key="i" class="ce-chip">
                      {{ s }} <button type="button" class="ce-x" @click="removeSpot(u, i)">×</button>
                    </span>
                    <input
                      :value="spotInputs[u.key] || ''"
                      class="ce-input"
                      :placeholder="'添加景点，回车'"
                      @input="spotInputs[u.key] = ($event.target as HTMLInputElement).value"
                      @keydown.enter.prevent="addSpot(u)"
                    />
                  </div>
                </div>
                <div class="day-edit-row">
                  <label class="day-edit-k">酒店</label>
                  <input class="wb-input" :value="((getField(u) as DayContent)?.hotel || '')" :placeholder="'酒店名'" @input="dayField(u, 'hotel', ($event.target as HTMLInputElement).value)" />
                </div>
                <div class="day-edit-row">
                  <label class="day-edit-k">备注</label>
                  <textarea class="wb-textarea" :value="((getField(u) as DayContent)?.notes || '')" :placeholder="'备注'" rows="3" @input="dayField(u, 'notes', ($event.target as HTMLTextAreaElement).value)"></textarea>
                </div>
              </template>

              <!-- 微站片段 -->
              <template v-else-if="u.key === 'html'">
                <div v-if="!htmlSegments.length" class="muted" style="padding:12px">（微站无可见文本片段，请先在编辑页上传 HTML 微站）</div>
                <div v-for="(seg, i) in htmlSegments" :key="i" class="html-seg-edit">
                  <div class="html-seg-hd">
                    <span class="html-seg-idx">{{ i + 1 }}</span>
                    <span v-if="zhSegments[i]" class="html-seg-zh">中: {{ zhSegments[i].text.slice(0, 60) }}{{ zhSegments[i].text.length > 60 ? '…' : '' }}</span>
                  </div>
                  <textarea
                    class="wb-textarea html-seg-ta"
                    :value="segmentEdits[i] !== undefined ? segmentEdits[i] : seg.text"
                    rows="2"
                    @input="segmentEdits[i] = ($event.target as HTMLTextAreaElement).value"
                  ></textarea>
                </div>
                <div class="html-seg-actions">
                  <button class="wb-btn ghost" :class="{ done: segmentApplied }" :disabled="!Object.keys(segmentEdits).length" @click="applyHtmlSegments">
                    {{ segmentApplied ? '已应用到微站 ✓' : '应用到微站' }}
                  </button>
                </div>
              </template>

              <!-- 保存按钮 -->
              <button class="wb-save-btn" :disabled="!!savingUnit" @click="saveCurrentUnit">
                {{ savingUnit === u.key ? '保存中…' : '保存本单元' }}
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- ═══ 右栏：实时预览 ═══ -->
      <div class="wb-right">
        <div class="wb-preview-hd">实时预览（{{ activeLang === 'en' ? 'English' : 'ไทย' }}）</div>
        <CaseDetailView
          :c="{
            ...c,
            titleEn: (modelValue as any).titleEn,
            titleTh: (modelValue as any).titleTh,
            descEn: (modelValue as any).descEn,
            descTh: (modelValue as any).descTh,
            highlightsEn: (modelValue as any).highlightsEn,
            highlightsTh: (modelValue as any).highlightsTh,
            daysContentEn: (modelValue as any).daysContentEn,
            daysContentTh: (modelValue as any).daysContentTh,
            contentHtmlEn: (modelValue as any).contentHtmlEn,
            contentHtmlTh: (modelValue as any).contentHtmlTh,
          }"
          :locale="activeLang"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ═══ 全局 ═══ */
.workbench {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface);
  max-height: calc(100vh - 180px);
}
.wb-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
  gap: 12px;
}
.wb-tabs {
  display: flex;
  gap: 4px;
}
.wb-tab {
  padding: 5px 14px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  cursor: pointer;
  font-size: 13px;
  font-family: inherit;
}
.wb-tab.active {
  background: var(--brand);
  color: #fff;
  border-color: var(--brand);
}
.wb-progress {
  display: flex;
  align-items: center;
  gap: 8px;
}
.wb-progress-text {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.wb-progress-bar {
  width: 80px;
  height: 5px;
  border-radius: 99px;
  background: var(--line);
  overflow: hidden;
}
.wb-progress-fill {
  height: 100%;
  background: var(--ok);
  border-radius: 99px;
  transition: width .3s;
}

/* ═══ 3 栏 ═══ */
.wb-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ═══ 左栏 ═══ */
.wb-left {
  width: 130px;
  flex: none;
  border-right: 1px solid var(--line);
  overflow-y: auto;
  background: var(--surface-2);
  padding: 8px 0;
}
.wb-unit-list {
  display: flex;
  flex-direction: column;
}
.wb-unit {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  border-left: 3px solid transparent;
  transition: background .15s;
}
.wb-unit:hover { background: var(--brand-50, rgba(24,95,165,.06)); }
.wb-unit.active {
  background: var(--brand-50, rgba(24,95,165,.08));
  border-left-color: var(--brand);
  font-weight: 600;
}
.wb-unit-dot {
  font-size: 13px;
  width: 18px;
  text-align: center;
  flex: none;
}
.wb-unit-dot.reviewed { color: var(--ok); }
.wb-unit-dot.ai { color: var(--warn); }
.wb-unit-dot.empty { color: var(--muted); }
.wb-unit-label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ═══ 中栏 ═══ */
.wb-center {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 14px;
}
.wb-editor {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.wb-source {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
}
.wb-source-hd {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 6px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .5px;
}
.wb-source-text {
  font-size: 13px;
  color: var(--ink-2);
  white-space: pre-wrap;
  line-height: 1.5;
}
.wb-divider {
  height: 1px;
  background: var(--line);
  margin: 12px 0;
}
.wb-target {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.wb-target-hd {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}
.wb-ai-btn {
  font-size: 11px;
  padding: 2px 8px;
  border: 1px solid var(--warn-50, #fef3c7);
  border-radius: 99px;
  background: var(--warn-50, #fef3c7);
  color: var(--warn, #92400e);
  cursor: default;
  font-family: inherit;
}
.wb-input {
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card);
  color: var(--text);
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 13px;
}
.wb-textarea {
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card);
  color: var(--text);
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
  min-height: 60px;
}
.wb-save-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: var(--brand);
  color: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  margin-top: 10px;
  align-self: flex-start;
}
.wb-save-btn:disabled {
  opacity: .6;
  cursor: not-allowed;
}
.wb-btn {
  padding: 6px 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card);
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}
.wb-btn.ghost { background: transparent; }
.wb-btn.done { background: var(--ok-50, #ecfdf5); border-color: var(--ok); color: var(--ok); }

/* chips 只读 */
.chips-ro {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.chip-ro {
  font-size: 12px;
  background: var(--brand-soft, #eef);
  color: var(--brand);
  border-radius: 99px;
  padding: 3px 10px;
}

/* chips 可编辑 */
.chips-edit {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.ce-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  background: var(--brand-soft, #eef);
  color: var(--brand);
  border-radius: 99px;
  padding: 3px 8px 3px 10px;
}
.ce-x {
  background: none;
  border: none;
  color: var(--brand);
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  padding: 0;
  opacity: .6;
}
.ce-x:hover { opacity: 1; }
.ce-input {
  flex: 1;
  min-width: 100px;
  padding: 5px 10px;
  font-size: 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--card);
  color: var(--text);
  font-family: inherit;
}

/* 每日行程编辑 */
.day-edit-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.day-edit-k {
  width: 36px;
  flex: none;
  font-size: 12px;
  color: var(--muted);
  padding-top: 8px;
  font-weight: 600;
}
.day-spots {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.day-spots .ce-input {
  min-width: 80px;
}
.day-src {
  font-size: 13px;
  color: var(--ink-2);
  padding: 2px 0;
}

/* 微站片段 */
.html-seg-ref {
  font-size: 12px;
  color: var(--muted);
  padding: 3px 0;
  line-height: 1.4;
  display: flex;
  gap: 6px;
}
.html-seg-idx {
  color: var(--brand);
  font-weight: 700;
  font-size: 11px;
  min-width: 18px;
  flex: none;
}
.html-seg-edit {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
  background: var(--surface-2);
}
.html-seg-hd {
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  align-items: baseline;
}
.html-seg-zh {
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.html-seg-ta {
  min-height: 44px;
}
.html-seg-actions {
  display: flex;
  justify-content: flex-end;
  padding: 4px 0;
}

/* ═══ 右栏 ═══ */
.wb-right {
  width: 340px;
  flex: none;
  border-left: 1px solid var(--line);
  overflow-y: auto;
  padding: 10px 12px;
  background: var(--surface-2);
}
.wb-preview-hd {
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 8px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .5px;
}

.muted { color: var(--muted); font-size: 12px; }

/* 移动端：Tab 切换，单栏 */
@media (max-width: 768px) {
  .wb-body {
    flex-direction: column;
  }
  .wb-left {
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
    padding: 6px 0;
  }
  .wb-unit-list {
    flex-direction: row;
    padding: 0 8px;
    gap: 4px;
  }
  .wb-unit {
    border-left: none;
    border-bottom: 2px solid transparent;
    padding: 6px 10px;
    font-size: 12px;
    white-space: nowrap;
  }
  .wb-unit.active {
    border-left-color: transparent;
    border-bottom-color: var(--brand);
  }
  .wb-right {
    width: 100%;
    border-left: none;
    border-top: 1px solid var(--line);
  }
}
</style>
