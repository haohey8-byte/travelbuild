<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { fetchCase, fetchCaseManage, updateCase, publishCase, unpublishCase, deleteCase, translateCase } from '@/api/cases'
import { useAuthStore } from '@/stores/auth'
import { copyText, buildShareText } from '@/utils/share'
import { fixImageUrl } from '@/utils/image'
import ImageUploader from '@/components/ImageUploader.vue'
import HtmlUploader from '@/components/HtmlUploader.vue'
import CaseDetailView from '@/components/CaseDetailView.vue'
import type { CaseItem, DayContent } from '@/types'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const { user } = storeToRefs(auth)

const id = computed(() => route.params.id as string)
const via = computed(() => (route.query.via as string) || undefined)

const c = ref<CaseItem | null>(null)
const loading = ref(true)
const err = ref('')
const notFound = ref(false)

// 页面模式：view 查看 / edit PandaKing 完整编辑 / review agency 仅校对翻译
type Mode = 'view' | 'edit' | 'review'
const mode = ref<Mode>('view')
const saving = ref(false)
const tab = ref<'edit' | 'preview'>('edit')
const newHighlight = ref('')
const newHighlightEn = ref('')
const newHighlightTh = ref('')
const form = ref<{
  title: string
  titleEn: string
  titleTh: string
  cover: string
  highlights: string[]
  highlightsEn: string[]
  highlightsTh: string[]
  descZh: string
  descEn: string
  descTh: string
  contentHtml: string
  contentHtmlEn: string
  contentHtmlTh: string
  daysContent: DayContent[]
  daysContentEn: DayContent[]
  daysContentTh: DayContent[]
  travelDate?: string | null
  groupSize?: number | null
  vehicle?: string | null
}>({
  title: '', titleEn: '', titleTh: '', cover: '', highlights: [], highlightsEn: [], highlightsTh: [],
  descZh: '', descEn: '', descTh: '',
  contentHtml: '', contentHtmlEn: '', contentHtmlTh: '',
  daysContent: [], daysContentEn: [], daysContentTh: [],
  travelDate: null, groupSize: null, vehicle: null,
})
const msg = ref('')

// 权限计算
const isPandaking = computed(() => user.value?.role === 'pandaking')
const isAgency = computed(() => user.value?.role === 'agency')
const canManage = computed(() => {
  if (isPandaking.value) return true
  if (isAgency.value && user.value?.agencyId && c.value?.agencyId === user.value.agencyId) return true
  return false
})
const canEdit = computed(() => isPandaking.value)
const canReview = computed(() => isAgency.value && canManage.value)
const isEditing = computed(() => mode.value === 'edit')
const isReviewing = computed(() => mode.value === 'review')
const isWorking = computed(() => isEditing.value || isReviewing.value)

// 草稿 localStorage（防意外中断丢失）
const draftKey = computed(() => `case-draft-${id.value}-${mode.value}`)
let draftTimer: ReturnType<typeof setTimeout> | null = null
watch(
  form,
  () => {
    if (!isWorking.value) return
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = setTimeout(() => {
      try {
        localStorage.setItem(draftKey.value, JSON.stringify(form.value))
      } catch {
        /* 忽略配额/隐私模式 */
      }
    }, 2000)
  },
  { deep: true },
)

// 预览用 CaseItem：把 form 合并进当前案例（保留 agencyBranding 等非编辑字段）
const previewCase = computed<CaseItem | null>(() => {
  if (!c.value) return null
  return {
    ...c.value,
    title: form.value.title,
    titleEn: form.value.titleEn,
    titleTh: form.value.titleTh,
    cover: form.value.cover,
    highlights: form.value.highlights,
    highlightsEn: form.value.highlightsEn,
    highlightsTh: form.value.highlightsTh,
    descZh: form.value.descZh,
    descEn: form.value.descEn,
    descTh: form.value.descTh,
    contentHtml: form.value.contentHtml,
    contentHtmlEn: form.value.contentHtmlEn,
    contentHtmlTh: form.value.contentHtmlTh,
    daysContent: form.value.daysContent,
    daysContentEn: form.value.daysContentEn,
    daysContentTh: form.value.daysContentTh,
    travelDate: form.value.travelDate || null,
    groupSize: form.value.groupSize ?? null,
    vehicle: form.value.vehicle || null,
  }
})

async function load() {
  loading.value = true
  err.value = ''
  notFound.value = false
  try {
    // 登录态走管理接口（草稿/下线也可打开编辑）；公开访问走公开接口（仅 published）
    c.value = auth.user
      ? await fetchCaseManage(id.value)
      : await fetchCase(id.value, via.value)
  } catch (e: any) {
    if (e?.response?.status === 404) notFound.value = true
    else err.value = e?.response?.data?.message || '加载失败'
    c.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([id, via], load)

// 复制「路线链接分享」文案（含出行时间/人数/用车 + 每日行程概览 + 详情链接）
const copying = ref(false)
const copied = ref(false)
const shareModal = ref(false)
const shareText = ref('')

async function onCopyShare() {
  const x = c.value
  if (!x || copying.value) return
  copying.value = true
  try {
    const text = buildShareText(x)
    const ok = await copyText(text)
    if (ok) {
      copied.value = true
      flash('分享文案已复制，直接粘贴到微信发送即可')
      setTimeout(() => (copied.value = false), 1800)
    } else {
      shareText.value = text
      shareModal.value = true
    }
  } finally {
    copying.value = false
  }
}

async function onRetryCopy() {
  const ok = await copyText(shareText.value)
  if (ok) {
    shareModal.value = false
    flash('复制成功，去微信粘贴发送即可')
  } else {
    flash('复制仍失败，请长按文案手动复制')
  }
}

function onSelectShare(e: Event) {
  const ta = e.target as HTMLTextAreaElement
  ta.focus()
  ta.select()
  try { ta.setSelectionRange(0, ta.value.length) } catch { /* */ }
}

// —— 离站咨询 CTA（境外旅行社联合品牌获客：展示机构联系方式 + 一键复制 + 引导加 Line）——
const ctaOpen = ref(false)
const ctaContacts = computed(() => {
  const ct = c.value?.agencyBranding?.contacts as Record<string, string> | null | undefined
  if (!ct) return []
  const items: { k: string; label: string; v: string; link?: string }[] = []
  if (ct.line) items.push({ k: 'line', label: 'Line', v: ct.line })
  if (ct.facebook) items.push({ k: 'facebook', label: 'Facebook', v: ct.facebook })
  if (ct.wechat) items.push({ k: 'wechat', label: '微信', v: ct.wechat })
  if (ct.phone) items.push({ k: 'phone', label: '电话', v: ct.phone, link: `tel:${ct.phone}` })
  if (ct.email) items.push({ k: 'email', label: '邮箱', v: ct.email, link: `mailto:${ct.email}` })
  return items
})
const ctaLine = computed(() => c.value?.agencyBranding?.contacts?.line)
async function copyCta(v: string, label: string) {
  const ok = await copyText(v)
  flash(ok ? '已复制 ' + label + '，去粘贴添加好友即可' : '复制失败，请长按手动复制')
}

function flash(m: string) {
  msg.value = m
  setTimeout(() => { if (msg.value === m) msg.value = '' }, 2600)
}

function initForm(x: CaseItem) {
  return {
    title: x.title || '',
    titleEn: x.titleEn || '',
    titleTh: x.titleTh || '',
    cover: x.cover || '',
    highlights: x.highlights ? [...x.highlights] : [],
    highlightsEn: x.highlightsEn ? [...x.highlightsEn] : [],
    highlightsTh: x.highlightsTh ? [...x.highlightsTh] : [],
    descZh: x.descZh || '',
    descEn: x.descEn || '',
    descTh: x.descTh || '',
    contentHtml: x.contentHtml || '',
    contentHtmlEn: x.contentHtmlEn || '',
    contentHtmlTh: x.contentHtmlTh || '',
    daysContent: (x.daysContent || []).map((d) => ({ ...d, spots: [...(d.spots || [])], meals: [...(d.meals || [])] })),
    daysContentEn: x.daysContentEn?.map((d) => ({ ...d, spots: [...(d.spots || [])], meals: [...(d.meals || [])] })) || [],
    daysContentTh: x.daysContentTh?.map((d) => ({ ...d, spots: [...(d.spots || [])], meals: [...(d.meals || [])] })) || [],
    travelDate: x.travelDate ? x.travelDate.slice(0, 10) : null,
    groupSize: x.groupSize ?? null,
    vehicle: x.vehicle || null,
  }
}

function restoreDraft() {
  try {
    const saved = localStorage.getItem(draftKey.value)
    if (saved) {
      const draft = JSON.parse(saved) as typeof form.value
      form.value = { ...form.value, ...draft }
      flash('已恢复自动保存的草稿')
    }
  } catch {
    /* 忽略 */
  }
}

function startEdit() {
  const x = c.value
  if (!x || !canEdit.value) return
  form.value = initForm(x)
  restoreDraft()
  tab.value = 'edit'
  mode.value = 'edit'
  msg.value = ''
}

function startReview() {
  const x = c.value
  if (!x || !canReview.value) return
  form.value = initForm(x)
  // agency 校对时若多语言行程为空，从中文源派生空壳结构，确保有输入位置
  if (!form.value.daysContentEn?.length && form.value.daysContent.length) {
    form.value.daysContentEn = form.value.daysContent.map((d) => ({
      day: d.day,
      city: d.city,
      spots: [...d.spots],
      hotel: d.hotel,
      meals: [...d.meals],
      notes: '',
      image: null,
    }))
  }
  if (!form.value.daysContentTh?.length && form.value.daysContent.length) {
    form.value.daysContentTh = form.value.daysContent.map((d) => ({
      day: d.day,
      city: d.city,
      spots: [...d.spots],
      hotel: d.hotel,
      meals: [...d.meals],
      notes: '',
      image: null,
    }))
  }
  restoreDraft()
  tab.value = 'edit'
  mode.value = 'review'
  msg.value = ''
}

function cancelWork() {
  mode.value = 'view'
}

async function onSave() {
  saving.value = true
  msg.value = ''
  try {
    let payload: Record<string, unknown>
    if (isReviewing.value) {
      // agency 仅提交多语言校对字段
      payload = {
        titleEn: form.value.titleEn?.trim() || undefined,
        titleTh: form.value.titleTh?.trim() || undefined,
        descEn: form.value.descEn || undefined,
        descTh: form.value.descTh || undefined,
        highlightsEn: form.value.highlightsEn,
        highlightsTh: form.value.highlightsTh,
        daysContentEn: form.value.daysContentEn,
        daysContentTh: form.value.daysContentTh,
        contentHtmlEn: form.value.contentHtmlEn || undefined,
        contentHtmlTh: form.value.contentHtmlTh || undefined,
      }
    } else {
      payload = {
        title: form.value.title.trim(),
        titleEn: form.value.titleEn?.trim() || undefined,
        titleTh: form.value.titleTh?.trim() || undefined,
        cover: form.value.cover?.trim() || undefined,
        highlights: form.value.highlights,
        highlightsEn: form.value.highlightsEn,
        highlightsTh: form.value.highlightsTh,
        descZh: form.value.descZh,
        descEn: form.value.descEn || undefined,
        descTh: form.value.descTh || undefined,
        contentHtml: form.value.contentHtml || undefined,
        contentHtmlEn: form.value.contentHtmlEn || undefined,
        contentHtmlTh: form.value.contentHtmlTh || undefined,
        daysContent: form.value.daysContent,
        daysContentEn: form.value.daysContentEn,
        daysContentTh: form.value.daysContentTh,
        travelDate: form.value.travelDate || null,
        groupSize: form.value.groupSize ? Number(form.value.groupSize) : null,
        vehicle: form.value.vehicle?.trim() || null,
      }
    }
    const updated = await updateCase(id.value, payload)
    c.value = updated
    mode.value = 'view'
    try { localStorage.removeItem(draftKey.value) } catch { /* */ }
    flash('保存成功')
  } catch (e: any) {
    const m = e?.response?.data?.message || e?.response?.data?.error || e?.message || '加载失败'
    const code = e?.response?.status ? ` (HTTP ${e.response.status})` : ''
    flash('保存失败' + code + '：' + m)
  } finally {
    saving.value = false
  }
}
async function onPublish() {
  await publishCase(id.value)
  await load()
}
async function onUnpublish() {
  await unpublishCase(id.value)
  await load()
}
async function onDelete() {
  if (!confirm('确定删除案例「' + (c.value?.title || '未命名案例') + '」？删除后不可恢复。')) return
  await deleteCase(id.value)
  router.push('/cases')
}

// —— AI 机器翻译（中文 → en/th，TMT；按 fields 翻译指定模块；不传=整体翻译 5 模块）
const translateBusy = ref(false)
const TRANS_ALL = ['title', 'desc', 'highlights', 'daysContent', 'contentHtml']
async function onTranslate(fields?: string[]) {
  if (translateBusy.value) return
  const wantAll = !fields || fields.length === 0
  const list = fields || TRANS_ALL

  // 校验：按请求的模块检查当前表单中文内容
  const moduleHasContent = (f: string) => {
    switch (f) {
      case 'title':
        return form.value.title.trim().length > 0
      case 'desc':
        return form.value.descZh.trim().length > 0
      case 'highlights':
        return form.value.highlights.length > 0
      case 'daysContent':
        return form.value.daysContent.length > 0
      case 'contentHtml':
        return form.value.contentHtml.trim().length > 0
      default:
        return false
    }
  }
  if (!TRANS_ALL.some((f) => list.includes(f) && moduleHasContent(f))) {
    flash('请先填写标题/描述/亮点/行程/HTML 任一中文内容')
    return
  }

  translateBusy.value = true
  try {
    const source = {
      title: form.value.title,
      descZh: form.value.descZh,
      highlights: form.value.highlights,
      daysContent: form.value.daysContent,
      contentHtml: form.value.contentHtml,
    }
    const updated = await translateCase(id.value, wantAll ? undefined : list, source)
    c.value = updated
    // 同步后端已保存的中文源
    form.value.title = updated.title || ''
    form.value.descZh = updated.descZh || ''
    form.value.highlights = updated.highlights ? [...updated.highlights] : []
    form.value.daysContent = (updated.daysContent || []).map((d) => ({
      ...d,
      spots: [...(d.spots || [])],
      meals: [...(d.meals || [])],
    }))
    form.value.contentHtml = updated.contentHtml || ''
    // 回填翻译结果
    form.value.titleEn = updated.titleEn || ''
    form.value.titleTh = updated.titleTh || ''
    form.value.descEn = updated.descEn || ''
    form.value.descTh = updated.descTh || ''
    form.value.highlightsEn = updated.highlightsEn || []
    form.value.highlightsTh = updated.highlightsTh || []
    form.value.daysContentEn = (updated.daysContentEn as DayContent[]) || []
    form.value.daysContentTh = (updated.daysContentTh as DayContent[]) || []
    form.value.contentHtmlEn = updated.contentHtmlEn || ''
    form.value.contentHtmlTh = updated.contentHtmlTh || ''
    flash(wantAll ? '已按当前内容生成英文+泰文初稿，请校对后保存' : `已翻译 ${list.join('、')} 模块，请校对后保存`)
  } catch (e: any) {
    const m = e?.response?.data?.message || e?.response?.data?.error || e?.message || '翻译失败'
    flash(`翻译失败：${m}`)
  } finally {
    translateBusy.value = false
  }
}

// 模块状态聚合：返回该语言已翻译模块数 / 总模块数 + 是否全部 reviewed
function transLangStatus(lang: 'en' | 'th') {
  const meta = c.value?.transMeta || {}
  const want = (field: string) =>
    lang === 'en'
      ? (field === 'highlights'
          ? (c.value?.highlightsEn?.length ?? 0) > 0
          : field === 'daysContent'
            ? (c.value?.daysContentEn?.length ?? 0) > 0
            : field === 'contentHtml'
              ? !!c.value?.contentHtmlEn
              : !!c.value?.[field === 'title' ? 'titleEn' : 'descEn'])
      : (field === 'highlights'
          ? (c.value?.highlightsTh?.length ?? 0) > 0
          : field === 'daysContent'
            ? (c.value?.daysContentTh?.length ?? 0) > 0
            : field === 'contentHtml'
              ? !!c.value?.contentHtmlTh
              : !!c.value?.[field === 'title' ? 'titleTh' : 'descTh'])
  const total = TRANS_ALL.length
  const done = TRANS_ALL.filter(want).length
  const allReviewed = TRANS_ALL.every((m) => !want(m) || (meta as any)[m]?.status === 'reviewed')
  return { done, total, allReviewed }
}

// 亮点 chips 编辑：支持逗号/顿号/分号分隔批量添加；重复项明确提示
function addHighlight() {
  const raw = newHighlight.value.trim()
  if (!raw) return
  const items = raw
    .split(/[,，、;；]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const dups: string[] = []
  for (const it of items) {
    if (form.value.highlights.includes(it)) {
      dups.push(it)
      continue
    }
    form.value.highlights.push(it)
  }
  newHighlight.value = ''
  if (dups.length) flash('已存在，跳过：' + dups.join('、'))
}
function removeHighlight(i: number) {
  form.value.highlights.splice(i, 1)
}
function addHighlightLang(lang: 'en' | 'th') {
  const inputRef = lang === 'en' ? newHighlightEn : newHighlightTh
  const raw = inputRef.value.trim()
  if (!raw) return
  const field = lang === 'en' ? 'highlightsEn' : 'highlightsTh'
  const items = raw.split(/[,，、;；]+/).map((s) => s.trim()).filter(Boolean)
  const dups: string[] = []
  for (const it of items) {
    if ((form.value as any)[field].includes(it)) {
      dups.push(it)
      continue
    }
    ;(form.value as any)[field].push(it)
  }
  inputRef.value = ''
  if (dups.length) flash('已存在，跳过：' + dups.join('、'))
}
function removeHighlightLang(lang: 'en' | 'th', i: number) {
  const field = lang === 'en' ? 'highlightsEn' : 'highlightsTh'
  ;(form.value as any)[field].splice(i, 1)
}
</script>

<template>
  <div class="detail-page">
    <div class="topbar">
      <router-link v-if="user" to="/cases" class="back">返回案例中心</router-link>
      <div class="top-actions">
        <!-- 非工作态：复制分享 + 管理/校对入口 -->
        <template v-if="!isWorking">
          <button class="btn sm" :class="{ copied }" :disabled="copying" @click="onCopyShare">
            {{ copied ? '已复制' : '复制分享' }}
          </button>
          <button v-if="canEdit" class="btn ghost sm" @click="startEdit">编辑内容</button>
          <button v-if="canReview" class="btn ghost sm" @click="startReview">校对翻译</button>
          <template v-if="canEdit">
            <button v-if="c?.status !== 'published'" class="btn sm" @click="onPublish">发布</button>
            <button v-else class="btn ghost sm" @click="onUnpublish">下线</button>
            <button class="btn ghost sm danger" @click="onDelete">删除</button>
          </template>
        </template>

        <!-- 编辑/校对态：保存 + 取消（PandaKing 编辑态额外显示 AI翻译） -->
        <template v-else>
          <button v-if="isEditing" class="btn ghost sm ai-btn" :disabled="translateBusy" :title="'基于中文内容一键生成英文+泰文初稿；发布时若缺失也会自动补翻。生成后请在下方双语区人工校对。'" @click="onTranslate()">
            {{ translateBusy ? '翻译中…' : '✨ AI翻译' }}
          </button>
          <button class="btn sm" :disabled="saving" @click="onSave">{{ saving ? '加载中…' : '保存' }}</button>
          <button class="btn ghost sm" @click="cancelWork">取消</button>
        </template>
      </div>
    </div>

    <p v-if="loading">加载中…</p>
    <p v-else-if="notFound" class="err">案例不存在</p>
    <p v-else-if="err" class="err">{{ err }}</p>

    <template v-else-if="c">
      <!-- 非工作态：公开视图（CaseDetailView）+ 管理按钮 -->
      <CaseDetailView v-if="!isWorking" :c="c" />
      <p v-if="!isWorking" class="wechat-tip">分享文案已复制，直接粘贴到微信发送即可</p>

      <!-- 工作态：双栏（桌面左编辑右预览 / 移动 Tab） -->
      <div v-if="isWorking" class="edit-layout" :class="tab">
        <div class="edit-tabs">
          <button :class="{ active: tab === 'edit' }" @click="tab = 'edit'">编辑内容</button>
          <button :class="{ active: tab === 'preview' }" @click="tab = 'preview'">预览</button>
        </div>
        <div class="edit-body">
          <div class="edit-pane">
            <!-- PandaKing 完整编辑字段 -->
            <template v-if="isEditing">
              <label>标题</label>
              <input v-model="form.title" class="field" :placeholder="'标题'" />
              <label>封面</label>
              <ImageUploader v-model="form.cover" :hint="'上传封面图'" />
              <label>亮点</label>
              <div class="chips-edit">
                <span v-for="(h, i) in form.highlights" :key="i" class="chip-edit">
                  {{ h }} <button type="button" class="chip-x" @click="removeHighlight(i)">×</button>
                </span>
                <input
                  v-model="newHighlight"
                  class="field chip-input"
                  :placeholder="'输入亮点，回车添加'"
                  @keydown.enter.prevent="addHighlight"
                />
              </div>
              <label>出行时间</label>
              <input v-model="form.travelDate" class="field" type="date" />
              <label>人数</label>
              <input v-model.number="form.groupSize" class="field" type="number" min="1" :placeholder="'人数'" />
              <label>用车</label>
              <input v-model="form.vehicle" class="field" :placeholder="'用车'" />
              <label>中文描述</label>
              <textarea v-model="form.descZh" class="field area" :placeholder="'填写中文描述'"></textarea>
            </template>

            <!-- agency 校对态：中文源只读摘要 -->
            <template v-if="isReviewing">
              <div class="source-summary">
                <div class="source-title">标题：{{ form.title || '未命名案例' }}</div>
                <div v-if="form.descZh" class="source-desc">{{ form.descZh }}</div>
              </div>
            </template>

            <!-- 双语校对区（edit / review 均显示） -->
            <div class="trans-bar">
              <span class="trans-bar-tip">双语校对（人工修正 AI 翻译）</span>
            </div>
            <div class="trans-langs">
              <div class="trans-lang">
                <div class="trans-lang-h">
                  <span class="trans-lang-name">English</span>
                  <span v-if="transLangStatus('en').done > 0" class="badge" :class="transLangStatus('en').allReviewed ? 'ok' : 'ai'">
                    {{ transLangStatus('en').allReviewed && transLangStatus('en').done === transLangStatus('en').total ? '✅ 已校对' : `🤖 AI ${transLangStatus('en').done}/${transLangStatus('en').total}` }}
                  </span>
                </div>
                <input v-model="form.titleEn" class="field" :placeholder="'English title'" />
                <textarea v-model="form.descEn" class="field area" :placeholder="'English description'"></textarea>
                <label class="sub-label">亮点</label>
                <div class="chips-edit">
                  <span v-for="(h, i) in form.highlightsEn" :key="i" class="chip-edit">
                    {{ h }} <button type="button" class="chip-x" @click="removeHighlightLang('en', i)">×</button>
                  </span>
                  <input
                    v-model="newHighlightEn"
                    class="field chip-input"
                    placeholder="English highlights, Enter"
                    @keydown.enter.prevent="addHighlightLang('en')"
                  />
                </div>
              </div>
              <div class="trans-lang">
                <div class="trans-lang-h">
                  <span class="trans-lang-name">ไทย</span>
                  <span v-if="transLangStatus('th').done > 0" class="badge" :class="transLangStatus('th').allReviewed ? 'ok' : 'ai'">
                    {{ transLangStatus('th').allReviewed && transLangStatus('th').done === transLangStatus('th').total ? '✅ 已校对' : `🤖 AI ${transLangStatus('th').done}/${transLangStatus('th').total}` }}
                  </span>
                </div>
                <input v-model="form.titleTh" class="field" :placeholder="'Thai title'" />
                <textarea v-model="form.descTh" class="field area" :placeholder="'Thai description'"></textarea>
                <label class="sub-label">亮点</label>
                <div class="chips-edit">
                  <span v-for="(h, i) in form.highlightsTh" :key="i" class="chip-edit">
                    {{ h }} <button type="button" class="chip-x" @click="removeHighlightLang('th', i)">×</button>
                  </span>
                  <input
                    v-model="newHighlightTh"
                    class="field chip-input"
                    placeholder="Highlights ภาษาไทย, Enter"
                    @keydown.enter.prevent="addHighlightLang('th')"
                  />
                </div>
              </div>
            </div>

            <!-- PandaKing 专属：中文源 HTML 微站 + 每日行程 -->
            <template v-if="isEditing">
              <label>HTML 微站</label>
              <HtmlUploader v-model="form.contentHtml" />

              <label>每日行程</label>
              <div v-for="(d, i) in form.daysContent" :key="d.day" class="day-card edit">
                <div class="day-head">第 {{ d.day }} 天 · {{ d.city }}</div>
                <div v-if="d.spots?.length" class="day-row"><span class="k">景点</span>
                  <span class="chips"><span v-for="s in d.spots" :key="s" class="chip sm">{{ s }}</span></span>
                </div>
                <div v-if="d.hotel" class="day-row"><span class="k">酒店</span><b>{{ d.hotel }}</b></div>
                <div class="day-img-edit">
                  <ImageUploader v-model="form.daysContent[i].image" :hint="'上传当日配图'" compact />
                </div>
                <textarea v-model="form.daysContent[i].notes" class="field area" :placeholder="'当日备注'"></textarea>
              </div>
            </template>

            <!-- 多语言 HTML 微站校对（edit / review 均显示） -->
            <label>English HTML</label>
            <textarea v-model="form.contentHtmlEn" class="field area" rows="6" placeholder="English HTML microsite content"></textarea>
            <label>Thai HTML</label>
            <textarea v-model="form.contentHtmlTh" class="field area" rows="6" placeholder="Thai HTML microsite content"></textarea>

            <!-- 多语言每日行程校对（edit / review 均显示） -->
            <label>English 每日行程</label>
            <div v-for="(d, i) in form.daysContentEn" :key="`en-${d.day}`" class="day-card edit">
              <div class="day-head">第 {{ d.day }} 天 · {{ d.city }}</div>
              <div v-if="d.spots?.length" class="day-row"><span class="k">景点</span>
                <span class="chips"><span v-for="s in d.spots" :key="s" class="chip sm">{{ s }}</span></span>
              </div>
              <div v-if="d.hotel" class="day-row"><span class="k">酒店</span><b>{{ d.hotel }}</b></div>
              <textarea v-model="form.daysContentEn[i].notes" class="field area" placeholder="English day notes"></textarea>
            </div>
            <label>Thai 每日行程</label>
            <div v-for="(d, i) in form.daysContentTh" :key="`th-${d.day}`" class="day-card edit">
              <div class="day-head">第 {{ d.day }} 天 · {{ d.city }}</div>
              <div v-if="d.spots?.length" class="day-row"><span class="k">景点</span>
                <span class="chips"><span v-for="s in d.spots" :key="s" class="chip sm">{{ s }}</span></span>
              </div>
              <div v-if="d.hotel" class="day-row"><span class="k">酒店</span><b>{{ d.hotel }}</b></div>
              <textarea v-model="form.daysContentTh[i].notes" class="field area" placeholder="Thai day notes"></textarea>
            </div>
          </div>

          <div class="preview-pane">
            <div class="preview-label">实时预览</div>
            <CaseDetailView v-if="previewCase" :c="previewCase" />
          </div>
        </div>
      </div>

      <p v-if="msg" class="msg">{{ msg }}</p>
    </template>
  </div>

  <!-- 离站咨询 CTA -->
  <button
    v-if="!isWorking && c?.agencyBranding && ctaContacts.length"
    class="cta-fab"
    @click="ctaOpen = true"
  >
    💬 咨询本行程
  </button>

  <!-- 咨询弹窗 -->
  <div v-if="ctaOpen" class="modal-mask" @click.self="ctaOpen = false">
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title">咨询本行程</div>
        <div class="modal-close" @click="ctaOpen = false">✕</div>
      </div>
      <div class="modal-body">
        <div class="cta-brand">
          <img
            v-if="c?.agencyBranding?.logoUrl"
            :src="fixImageUrl(c.agencyBranding.logoUrl)"
            class="cta-logo"
            alt="logo"
          />
          <span v-else class="cta-logo fb">{{ (c?.agencyBranding?.name || '?').slice(0, 1) }}</span>
          <div>
            <div class="cta-name">{{ c?.agencyBranding?.name }}</div>
            <div class="cta-co">联合提供</div>
          </div>
        </div>
        <p class="cta-tip">行程与报价咨询，请通过以下方式联系：</p>
        <div v-if="ctaLine" class="cta-line-main" @click="copyCta(ctaLine, 'Line')">
          <span class="cta-line-ico">L</span>
          <div class="cta-line-meta">
            <div class="cta-line-label">添加 Line</div>
            <div class="cta-line-id">Line ID: {{ ctaLine }}</div>
          </div>
          <button class="btn btn-primary btn-sm">一键复制</button>
        </div>
        <div class="cta-list">
          <div v-for="it in ctaContacts" :key="it.k" class="cta-item">
            <span class="cta-k">{{ it.label }}</span>
            <a v-if="it.link" :href="it.link" class="cta-v" target="_blank" rel="noopener">{{ it.v }}</a>
            <span v-else class="cta-v">{{ it.v }}</span>
            <button class="btn btn-sm btn-ghost" @click="copyCta(it.v, it.label)">复制</button>
          </div>
        </div>
        <p class="cta-foot">本案例由 {{ c?.agencyBranding?.name || '' }} 与 PandaKing9 联合提供 · 定制旅行</p>
      </div>
    </div>
  </div>

  <!-- 复制分享文案弹窗 -->
  <div v-if="shareModal" class="modal-mask" @click.self="shareModal = false">
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title">复制分享文案</div>
        <div class="modal-close" @click="shareModal = false">✕</div>
      </div>
      <div class="modal-body">
        <p class="share-tip" v-html="'自动复制失败，请长按下方文案手动复制，然后粘贴到微信发送：'"></p>
        <textarea
          class="share-ta"
          readonly
          :value="shareText"
          @focus="onSelectShare"
          @click="onSelectShare"
        ></textarea>
      </div>
      <div class="modal-foot">
        <button class="btn" @click="shareModal = false">关闭</button>
        <button class="btn btn-primary" @click="onRetryCopy">重新复制</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page { max-width: 920px; margin: 0 auto; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; flex-wrap: wrap; }
.back { color: var(--brand); text-decoration: none; }
.top-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.wechat-tip { color: var(--muted); font-size: 13px; margin: 14px 0; }

/* 双栏编辑布局 */
.edit-layout { margin-top: 4px; }
.edit-tabs { display: none; }
.edit-body { display: flex; gap: 16px; align-items: flex-start; }
.edit-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.preview-pane { flex: 1; min-width: 0; position: sticky; top: 12px; }
.preview-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.edit-pane label, .sub-label { font-size: 13px; color: var(--muted); margin-top: 10px; }
.edit-pane label:first-child { margin-top: 0; }

.source-summary {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-left: 3px solid var(--brand);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 4px;
}
.source-title { font-weight: 600; margin-bottom: 4px; }
.source-desc { color: var(--muted); font-size: 13px; white-space: pre-wrap; line-height: 1.6; }

.chips-edit { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.chip-edit {
  display: inline-flex; align-items: center; gap: 4px; font-size: 12px;
  background: var(--brand-soft, #eef); color: var(--brand); border-radius: 999px; padding: 3px 8px 3px 10px;
}
.chip-x { background: none; border: none; color: var(--brand); cursor: pointer; font-size: 14px; line-height: 1; padding: 0; opacity: .6; }
.chip-x:hover { opacity: 1; }
.chip-input { flex: 1; min-width: 120px; padding: 5px 10px; font-size: 12px; }

.day-card.edit { border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin-bottom: 10px; background: var(--card); }
.day-head { font-weight: 600; margin-bottom: 6px; }
.day-row { display: flex; gap: 8px; align-items: flex-start; padding: 3px 0; }
.day-row .k { color: var(--muted); width: 40px; flex: none; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { font-size: 12px; background: var(--brand-soft, #eef); color: var(--brand); border-radius: 999px; padding: 2px 8px; }
.chip.sm { font-size: 11px; }
.day-img-edit { margin: 6px 0; }

.field { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--text); width: 100%; box-sizing: border-box; }
.area { min-height: 80px; resize: vertical; }

/* AI 翻译 + 多语言校对 */
.trans-bar { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-top: 8px; background: var(--brand-50); border: 1px solid var(--brand-100); border-radius: 8px; }
.trans-bar-tip { flex: 1; font-size: 12px; color: var(--brand-600); }
.trans-langs { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
.trans-lang { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: var(--surface-2); }
.trans-lang-h { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.trans-lang-name { font-size: 12.5px; font-weight: 600; color: var(--ink-2); }
.trans-lang .field { margin-bottom: 6px; }
.badge { padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
.badge.ai { background: var(--warn-50); color: var(--warn); }
.badge.ok { background: var(--ok-50); color: var(--ok); }

.btn { padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--brand); color: #fff; cursor: pointer; font-family: inherit; }
.btn.sm { padding: 3px 10px; font-size: 12px; }
.btn.ghost { background: transparent; color: var(--text); }
.btn.ghost.sm { padding: 3px 10px; font-size: 12px; }
.btn.ghost.danger { color: var(--danger); border-color: var(--danger); }
.btn.copied { background: var(--ok); border-color: var(--ok); }
.btn.ai-btn { color: var(--brand-600); border-color: var(--brand-200); background: var(--brand-50); }
.err { color: var(--danger); }
.msg { color: var(--ok); font-size: 13px; margin-top: 10px; }

/* 复制分享文案弹窗 */
.modal-mask { position: fixed; inset: 0; background: rgba(18, 26, 41, .45); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 20px; }
.modal { width: 560px; max-width: 100%; background: var(--surface); border-radius: 16px; box-shadow: var(--sh-lg, 0 18px 48px rgba(20,32,51,.16)); overflow: hidden; }
.modal-head { padding: 16px 20px; border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; align-items: center; }
.modal-title { font-size: 16px; font-weight: 700; }
.modal-close { width: 26px; height: 26px; border-radius: 6px; color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.modal-close:hover { background: var(--surface-2); color: var(--ink); }
.modal-body { padding: 18px 20px; }
.share-tip { font-size: 13px; color: var(--ink-2); margin-bottom: 10px; }
.share-tip b { color: var(--brand-600); }
.share-ta {
  width: 100%; min-height: 220px; padding: 12px; border: 1px solid var(--line-strong);
  border-radius: 10px; font-size: 13px; line-height: 1.6; background: var(--surface-2);
  color: var(--ink); font-family: inherit; resize: vertical; box-sizing: border-box;
  white-space: pre-wrap;
}
.modal-foot { padding: 13px 20px; border-top: 1px solid var(--line); display: flex; justify-content: flex-end; gap: 8px; background: var(--surface-2); }

/* 离站咨询 CTA */
.cta-fab {
  position: fixed; right: 22px; bottom: 26px; z-index: 40;
  padding: 12px 20px; border: none; border-radius: var(--r-pill, 999px);
  background: var(--brand); color: #fff; font-size: 14.5px; font-weight: 600;
  font-family: inherit; cursor: pointer;
  box-shadow: 0 8px 24px rgba(24, 95, 165, .35);
  transition: transform .15s, box-shadow .15s;
}
.cta-fab:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(24, 95, 165, .4); }
.cta-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.cta-logo { width: 46px; height: 46px; border-radius: 10px; object-fit: cover; background: var(--brand-50); }
.cta-logo.fb { display: flex; align-items: center; justify-content: center; background: var(--brand); color: #fff; font-size: 20px; font-weight: 700; }
.cta-name { font-weight: 700; font-size: 15px; }
.cta-co { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
.cta-tip { font-size: 13px; color: var(--ink-2); margin-bottom: 12px; }
.cta-line-main {
  display: flex; align-items: center; gap: 12px; padding: 12px 14px;
  background: var(--brand-50); border: 1px solid var(--brand-100); border-radius: var(--r-md);
  margin-bottom: 12px; cursor: pointer;
}
.cta-line-ico {
  width: 38px; height: 38px; border-radius: 9px; background: var(--brand); color: #fff;
  display: flex; align-items: center; justify-content: center; font-size: 17px; font-weight: 700; flex-shrink: 0;
}
.cta-line-meta { flex: 1; }
.cta-line-label { font-size: 13.5px; font-weight: 600; color: var(--brand-600); }
.cta-line-id { font-size: 12.5px; color: var(--ink-2); margin-top: 2px; }
.cta-list { display: flex; flex-direction: column; gap: 8px; }
.cta-item {
  display: flex; align-items: center; gap: 10px; padding: 9px 12px;
  border: 1px solid var(--line); border-radius: var(--r-sm); background: var(--surface-2);
}
.cta-k { font-size: 12px; color: var(--muted); min-width: 62px; font-weight: 600; }
.cta-v { flex: 1; font-size: 13.5px; color: var(--ink); text-decoration: none; word-break: break-all; }
.cta-foot { font-size: 11.5px; color: var(--muted); margin-top: 14px; text-align: center; }

/* 移动端：Tab 切换，单栏 */
@media (max-width: 768px) {
  .edit-tabs { display: flex; gap: 8px; margin-bottom: 10px; }
  .edit-tabs button {
    flex: 1; padding: 8px; border: 1px solid var(--line); border-radius: 8px;
    background: var(--card); color: var(--text); cursor: pointer; font-size: 13px;
  }
  .edit-tabs button.active { background: var(--brand); color: #fff; border-color: var(--brand); }
  .edit-body { flex-direction: column; }
  .preview-pane { position: static; }
  .edit-layout.edit .preview-pane { display: none; }
  .edit-layout.preview .edit-pane { display: none; }
  .topbar { flex-direction: column; align-items: flex-start; }
  .top-actions { width: 100%; justify-content: flex-end; }
}
@media (max-width: 640px) {
  .trans-langs { grid-template-columns: 1fr; }
}
</style>
