<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { fetchCase, updateCase, publishCase, unpublishCase, deleteCase } from '@/api/cases'
import { useAuthStore } from '@/stores/auth'
import { safeText } from '@/utils/name'
import { copyText } from '@/utils/share'
import ImageUploader from '@/components/ImageUploader.vue'
import HtmlUploader from '@/components/HtmlUploader.vue'
import CaseHtmlView from '@/components/CaseHtmlView.vue'
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
const form = ref<{
  title: string
  cover: string
  highlights: string
  descZh: string
  contentHtml: string
  daysContent: DayContent[]
}>({ title: '', cover: '', highlights: '', descZh: '', contentHtml: '', daysContent: [] })
const msg = ref('')

async function load() {
  loading.value = true
  err.value = ''
  notFound.value = false
  try {
    c.value = await fetchCase(id.value, via.value)
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

function caseTitle(): string {
  return safeText(c.value?.title) || safeText(c.value?.destination) || '未命名案例'
}

// 分享链接：保留 via 参数，使接收方也能看到联合品牌
const shareLink = computed(() => {
  const base = window.location.origin + (import.meta.env.VITE_BASE || '/')
  return `${base}#/cases/${id.value}${via.value ? '?via=' + via.value : ''}`
})
function shareCaption(): string {
  const x = c.value
  if (!x) return ''
  return `${caseTitle()} · ${safeText(x.destination)} · ${x.priceRange}\n${shareLink.value}`
}

async function onCopyLink() {
  const ok = await copyText(shareLink.value)
  flash(ok ? '链接已复制' : '复制失败，请长按链接手动复制')
}
async function onCopyCaption() {
  const ok = await copyText(shareCaption())
  flash(ok ? '文案已复制' : '复制失败，请长按手动复制')
}
function flash(m: string) {
  msg.value = m
  setTimeout(() => { if (msg.value === m) msg.value = '' }, 2200)
}

function startEdit() {
  const x = c.value
  if (!x) return
  form.value = {
    title: x.title || '',
    cover: x.cover || '',
    highlights: (x.highlights || []).join('、'),
    descZh: x.descZh || '',
    contentHtml: x.contentHtml || '',
    daysContent: (x.daysContent || []).map((d) => ({ ...d, spots: [...(d.spots || [])], meals: [...(d.meals || [])] })),
  }
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
      highlights: form.value.highlights.split(/[、,，]/).map((s) => s.trim()).filter(Boolean),
      descZh: form.value.descZh,
      contentHtml: form.value.contentHtml || undefined,
      daysContent: form.value.daysContent,
    }
    const updated = await updateCase(id.value, payload)
    c.value = updated
    editing.value = false
    flash('已保存')
  } catch (e: any) {
    flash(e?.response?.data?.message || '保存失败')
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

const contactList = computed(() => {
  const ct = c.value?.agencyBranding?.contacts
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
  <div class="detail-page">
    <div class="topbar">
      <router-link to="/cases" class="back">← 返回案例</router-link>
      <div class="share" v-if="!editing">
        <button class="btn sm" @click="onCopyLink">复制链接</button>
        <button class="btn ghost sm" @click="onCopyCaption">复制文案</button>
      </div>
    </div>

    <p v-if="loading">加载中…</p>
    <p v-else-if="notFound" class="err">案例不存在或未发布</p>
    <p v-else-if="err" class="err">{{ err }}</p>

    <template v-else-if="c">
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

      <!-- 案例主体 HTML（运营上传的单文件微站，服务端 sanitize 后存；沙箱 iframe 渲染） -->
      <CaseHtmlView v-if="!editing && c.contentHtml" :html="c.contentHtml" class="content-html" />

      <!-- 每日图文 -->
      <section v-if="c.daysContent?.length" class="days">
        <h2>行程亮点（每日）</h2>
        <div v-for="(d, i) in (editing ? form.daysContent : c.daysContent)" :key="d.day" class="day-card">
          <img v-if="!editing && d.image" :src="d.image" class="day-img" alt="" />
          <div class="day-head">第 {{ d.day }} 天 · {{ d.city }}</div>
          <div v-if="d.spots?.length" class="day-row"><span class="k">景点</span>
            <span class="chips"><span v-for="s in d.spots" :key="s" class="chip sm">{{ s }}</span></span>
          </div>
          <div v-if="d.hotel" class="day-row"><span class="k">酒店</span><b>{{ d.hotel }}</b></div>
          <div v-if="d.meals?.length" class="day-row"><span class="k">餐饮</span>
            <span class="chips"><span v-for="m in d.meals" :key="m" class="chip sm">{{ m }}</span></span>
          </div>
          <div v-if="!editing && d.notes" class="day-notes">{{ d.notes }}</div>
          <!-- 编辑态：每日 image + notes 可编辑 -->
          <template v-if="editing">
            <div class="day-row edit"><span class="k">图片</span>
              <input v-model="form.daysContent[i].image" class="field" placeholder="图片 URL" />
            </div>
            <textarea v-model="form.daysContent[i].notes" class="field area" placeholder="当日备注"></textarea>
          </template>
        </div>
      </section>

      <!-- 微信引导 -->
      <p v-if="!editing" class="wechat-tip">复制链接或文案后，粘贴到微信发送给客户即可。</p>

      <!-- 管理员编辑面板 -->
      <div v-if="user" class="admin card">
        <div v-if="!editing" class="admin-bar">
          <button class="btn ghost sm" @click="startEdit">编辑内容</button>
          <button v-if="c.status !== 'published'" class="btn sm" @click="onPublish">发布</button>
          <button v-else class="btn ghost sm" @click="onUnpublish">下线</button>
          <button class="btn ghost sm danger" @click="onDelete">删除</button>
        </div>

        <div v-else class="edit-form">
          <label>标题</label>
          <input v-model="form.title" class="field" placeholder="案例标题" />
          <label>封面图</label>
          <ImageUploader v-model="form.cover" hint="点击或拖拽上传封面（jpg/png/webp，自动压缩）" />
          <label>亮点（顿号/逗号分隔）</label>
          <input v-model="form.highlights" class="field" placeholder="如 亲子友好、含接送" />
          <label>描述</label>
          <textarea v-model="form.descZh" class="field area" placeholder="图文产品页正文"></textarea>
          <label>内容 HTML（单文件微站）</label>
          <HtmlUploader v-model="form.contentHtml" />
          <div class="edit-actions">
            <button class="btn sm" :disabled="saving" @click="onSave">保存</button>
            <button class="btn ghost sm" @click="cancelEdit">取消</button>
          </div>
        </div>
      </div>

      <p v-if="msg" class="msg">{{ msg }}</p>
    </template>
  </div>
</template>

<style scoped>
.detail-page { max-width: 920px; margin: 0 auto; }
.topbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.back { color: var(--brand); text-decoration: none; }
.share { display: flex; gap: 6px; }
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
.day-row.edit { align-items: center; }
.wechat-tip { color: var(--muted); font-size: 13px; margin: 14px 0; }
.admin { margin-top: 16px; padding: 12px; }
.admin-bar { display: flex; gap: 8px; flex-wrap: wrap; }
.edit-form { display: flex; flex-direction: column; gap: 6px; }
.edit-form label { font-size: 13px; color: var(--muted); margin-top: 6px; }
.edit-actions { display: flex; gap: 8px; margin-top: 10px; }
.field { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--text); width: 100%; box-sizing: border-box; }
.area { min-height: 80px; resize: vertical; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
.btn { padding: 6px 12px; border: 1px solid var(--line); border-radius: 8px; background: var(--brand); color: #fff; cursor: pointer; }
.btn.sm { padding: 3px 10px; font-size: 12px; }
.btn.ghost { background: transparent; color: var(--text); }
.btn.ghost.sm { padding: 3px 10px; font-size: 12px; }
.btn.ghost.danger { color: var(--danger); border-color: var(--danger); }
.err { color: var(--danger); }
.msg { color: var(--ok); font-size: 13px; margin-top: 10px; }

@media (max-width: 640px) {
  .hero { height: 200px; }
}
</style>
