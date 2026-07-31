<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { fetchCase, fetchCaseManage, updateCase, publishCase, unpublishCase, deleteCase } from '@/api/cases'
import { useAuthStore } from '@/stores/auth'
import { copyText, buildShareText } from '@/utils/share'
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

// 编辑态
const editing = ref(false)
const saving = ref(false)
const tab = ref<'edit' | 'preview'>('edit')
const newHighlight = ref('')
const form = ref<{
  title: string
  cover: string
  highlights: string[]
  descZh: string
  contentHtml: string
  daysContent: DayContent[]
  travelDate?: string | null
  groupSize?: number | null
  vehicle?: string | null
}>({ title: '', cover: '', highlights: [], descZh: '', contentHtml: '', daysContent: [], travelDate: null, groupSize: null, vehicle: null })
const msg = ref('')

// 草稿 localStorage（防意外中断丢失）
const draftKey = computed(() => `case-draft-${id.value}`)
let draftTimer: ReturnType<typeof setTimeout> | null = null
watch(
  form,
  () => {
    if (!editing.value) return
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
    cover: form.value.cover,
    highlights: form.value.highlights,
    descZh: form.value.descZh,
    contentHtml: form.value.contentHtml,
    daysContent: form.value.daysContent,
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
// 产品反馈闭环：成功 → 按钮变「✓ 已复制」+ 顶部提示；失败（微信 webview 常禁用 Clipboard）→
// 弹出文案弹窗自动全选，引导长按手动复制 + 重试按钮，用户永远知道结果。
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
    flash('已复制！直接粘贴到微信发送即可')
  } else {
    flash('复制仍失败，请长按上方文字手动复制')
  }
}

function onSelectShare(e: Event) {
  // 点入文本区自动全选，方便长按复制
  const ta = e.target as HTMLTextAreaElement
  ta.focus()
  ta.select()
  try { ta.setSelectionRange(0, ta.value.length) } catch { /* */ }
}

function flash(m: string) {
  msg.value = m
  setTimeout(() => { if (msg.value === m) msg.value = '' }, 2600)
}

function startEdit() {
  const x = c.value
  if (!x) return
  form.value = {
    title: x.title || '',
    cover: x.cover || '',
    highlights: x.highlights ? [...x.highlights] : [],
    descZh: x.descZh || '',
    contentHtml: x.contentHtml || '',
    daysContent: (x.daysContent || []).map((d) => ({ ...d, spots: [...(d.spots || [])], meals: [...(d.meals || [])] })),
    travelDate: x.travelDate ? x.travelDate.slice(0, 10) : null,
    groupSize: x.groupSize ?? null,
    vehicle: x.vehicle || null,
  }
  // 恢复未保存草稿（若有）
  try {
    const saved = localStorage.getItem(draftKey.value)
    if (saved) {
      const draft = JSON.parse(saved) as typeof form.value
      form.value = { ...form.value, ...draft }
      flash('已恢复上次未保存的草稿')
    }
  } catch {
    /* 忽略 */
  }
  tab.value = 'edit'
  editing.value = true
  msg.value = ''
}
function cancelEdit() {
  editing.value = false
}
async function onSave() {
  saving.value = true
  msg.value = ''
  try {
    const payload = {
      title: form.value.title.trim(),
      cover: form.value.cover?.trim() || undefined,
      highlights: form.value.highlights,
      descZh: form.value.descZh,
      contentHtml: form.value.contentHtml || undefined,
      daysContent: form.value.daysContent,
      travelDate: form.value.travelDate || null,
      groupSize: form.value.groupSize ? Number(form.value.groupSize) : null,
      vehicle: form.value.vehicle?.trim() || null,
    }
    const updated = await updateCase(id.value, payload)
    // 用后端权威返回刷新 c.value（避免本地 form 状态与 DB 不一致）
    c.value = updated
    editing.value = false
    // 保存成功清草稿
    try { localStorage.removeItem(draftKey.value) } catch { /* */ }
    flash('已保存')
  } catch (e: any) {
    // 显示详细错误（含后端 message），便于诊断字段丢失
    const msg = e?.response?.data?.message || e?.response?.data?.error || e?.message || '保存失败'
    const code = e?.response?.status ? ` (HTTP ${e.response.status})` : ''
    flash(`保存失败${code}：${msg}`)
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
  if (!confirm('确认删除该案例？')) return
  await deleteCase(id.value)
  router.push('/cases')
}

// 亮点 chips 编辑：支持逗号/顿号/分号分隔批量添加；重复项明确提示（不静默吞掉，避免"写了 N 个只有 M 个"）
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
  if (dups.length) flash(`已存在，未重复添加：${dups.join('、')}`)
}
function removeHighlight(i: number) {
  form.value.highlights.splice(i, 1)
}
</script>

<template>
  <div class="detail-page">
    <div class="topbar">
      <router-link v-if="user" to="/cases" class="back">← 返回案例</router-link>
      <div class="share" v-if="!editing">
        <button class="btn sm" :class="{ copied }" :disabled="copying" @click="onCopyShare">
          {{ copied ? '✓ 已复制' : '复制路线链接分享' }}
        </button>
      </div>
      <div v-else class="edit-head">
        <span class="edit-title">编辑内容</span>
        <button class="btn sm" :disabled="saving" @click="onSave">保存</button>
        <button class="btn ghost sm" @click="cancelEdit">取消</button>
      </div>
    </div>

    <p v-if="loading">加载中…</p>
    <p v-else-if="notFound" class="err">案例不存在或未发布</p>
    <p v-else-if="err" class="err">{{ err }}</p>

    <template v-else-if="c">
      <!-- 非编辑态：公开视图（CaseDetailView）+ 管理按钮 -->
      <CaseDetailView v-if="!editing" :c="c" />
      <p v-if="!editing" class="wechat-tip">复制路线链接分享后，粘贴到微信发送给客户即可。</p>

      <div v-if="!editing && user && user.role === 'pandaking'" class="admin-bar">
        <button class="btn ghost sm" @click="startEdit">编辑内容</button>
        <button v-if="c.status !== 'published'" class="btn sm" @click="onPublish">发布</button>
        <button v-else class="btn ghost sm" @click="onUnpublish">下线</button>
        <button class="btn ghost sm danger" @click="onDelete">删除</button>
      </div>

      <!-- 编辑态：双栏（桌面左编辑右预览 / 移动 Tab） -->
      <div v-if="editing" class="edit-layout" :class="tab">
        <div class="edit-tabs">
          <button :class="{ active: tab === 'edit' }" @click="tab = 'edit'">编辑</button>
          <button :class="{ active: tab === 'preview' }" @click="tab = 'preview'">预览</button>
        </div>
        <div class="edit-body">
          <div class="edit-pane">
            <label>标题</label>
            <input v-model="form.title" class="field" placeholder="案例标题" />
            <label>封面图</label>
            <ImageUploader v-model="form.cover" hint="点击或拖拽上传封面（jpg/png/webp，自动压缩）" />
            <label>亮点</label>
            <div class="chips-edit">
              <span v-for="(h, i) in form.highlights" :key="i" class="chip-edit">
                {{ h }} <button type="button" class="chip-x" @click="removeHighlight(i)">×</button>
              </span>
              <input
                v-model="newHighlight"
                class="field chip-input"
                placeholder="输入后回车添加"
                @keydown.enter.prevent="addHighlight"
              />
            </div>
            <label>出行时间</label>
            <input v-model="form.travelDate" class="field" type="date" />
            <label>人数</label>
            <input v-model.number="form.groupSize" class="field" type="number" min="1" placeholder="出行人数" />
            <label>用车</label>
            <input v-model="form.vehicle" class="field" placeholder="如 15座中巴" />
            <label>描述</label>
            <textarea v-model="form.descZh" class="field area" placeholder="图文产品页正文"></textarea>
            <label>内容 HTML（单文件微站）</label>
            <HtmlUploader v-model="form.contentHtml" />

            <label>每日行程</label>
            <div v-for="(d, i) in form.daysContent" :key="d.day" class="day-card edit">
              <div class="day-head">第 {{ d.day }} 天 · {{ d.city }}</div>
              <div v-if="d.spots?.length" class="day-row"><span class="k">景点</span>
                <span class="chips"><span v-for="s in d.spots" :key="s" class="chip sm">{{ s }}</span></span>
              </div>
              <div v-if="d.hotel" class="day-row"><span class="k">酒店</span><b>{{ d.hotel }}</b></div>
              <div class="day-img-edit">
                <ImageUploader v-model="form.daysContent[i].image" hint="每日主图（自动压缩）" compact />
              </div>
              <textarea v-model="form.daysContent[i].notes" class="field area" placeholder="当日备注"></textarea>
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

  <!-- 复制分享文案弹窗（自动复制失败时的可靠兜底：全选 + 长按手动复制 + 重试） -->
  <div v-if="shareModal" class="modal-mask" @click.self="shareModal = false">
    <div class="modal">
      <div class="modal-head">
        <div class="modal-title">复制分享文案</div>
        <div class="modal-close" @click="shareModal = false">✕</div>
      </div>
      <div class="modal-body">
        <p class="share-tip">自动复制未成功，请<b>长按下方文字手动复制</b>，再粘贴到微信发送：</p>
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
        <button class="btn btn-primary" @click="onRetryCopy">重试复制</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page { max-width: 920px; margin: 0 auto; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 8px; }
.back { color: var(--brand); text-decoration: none; }
.share { display: flex; gap: 6px; }
.edit-head { display: flex; align-items: center; gap: 8px; }
.edit-title { font-size: 14px; color: var(--muted); margin-right: auto; }
.wechat-tip { color: var(--muted); font-size: 13px; margin: 14px 0; }
.admin-bar { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }

/* 双栏编辑布局 */
.edit-layout { margin-top: 4px; }
.edit-tabs { display: none; }
.edit-body { display: flex; gap: 16px; align-items: flex-start; }
.edit-pane { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.preview-pane { flex: 1; min-width: 0; position: sticky; top: 12px; }
.preview-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.edit-pane label { font-size: 13px; color: var(--muted); margin-top: 10px; }
.edit-pane label:first-child { margin-top: 0; }

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
.btn { padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--brand); color: #fff; cursor: pointer; }
.btn.sm { padding: 3px 10px; font-size: 12px; }
.btn.ghost { background: transparent; color: var(--text); }
.btn.ghost.sm { padding: 3px 10px; font-size: 12px; }
.btn.ghost.danger { color: var(--danger); border-color: var(--danger); }
.btn.copied { background: var(--ok); border-color: var(--ok); }
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
}
</style>
