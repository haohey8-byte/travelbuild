<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchH5Route, submitH5Feedback } from '@/api/h5'
import { fetchRouteFeedback } from '@/api/routes'
import { safeText } from '@/utils/name'
import type { H5Route, RouteFeedbackItem } from '@/types'

const route = useRoute()
const router = useRouter()
const token = route.params.token as string

const data = ref<H5Route | null>(null)
const notFound = ref(false)
const loading = ref(true)
const feedback = ref('')
const authorName = ref('')
const submitting = ref(false)
const thanks = ref(false)
const sendErr = ref('')
const feedbackList = ref<RouteFeedbackItem[]>([])
async function loadFeedback() {
  try {
    feedbackList.value = await fetchRouteFeedback(data.value!.routeId)
  } catch {
    feedbackList.value = []
  }
}
function fmtTime(s?: string): string {
  if (!s) return ''
  try {
    return new Date(s).toLocaleString()
  } catch {
    return s
  }
}

const days = computed(() => {
  const it = data.value?.itinerary as { days?: any[] } | null
  return it?.days ?? []
})

// 状态中文标签（避免 H5 暴露原始机器键）
const STATUS_LABEL: Record<string, string> = {
  consulting: '咨询中',
  awaiting_pk_confirm: '待一手确认',
  awaiting_agency_revision: '待旅行社修订',
  awaiting_quote: '待报价',
  awaiting_feedback: '待反馈',
  awaiting_confirm: '待确认',
  confirmed: '已确认',
  lost: '已流失',
}
function statusLabel(k: string): string {
  return STATUS_LABEL[k] ?? k
}

// 客户端兜底：覆盖 index.html 中的通用 OG 标签（对支持 JS 的分享场景）
function updateOgMeta(key: string, content: string) {
  const sel = `meta[property="${key}"], meta[name="${key}"]`
  let el = document.head.querySelector(sel) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    if (key.startsWith('og:')) el.setAttribute('property', key)
    else el.setAttribute('name', key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

onMounted(async () => {
  try {
    data.value = await fetchH5Route(token)
    // 设置浏览器标签标题，打开分享链接时显示对客标题
    const title = `${safeText(data.value.destination) || '定制行程'} · 定制行程方案`
    document.title = title
    updateOgMeta('og:title', title)
      updateOgMeta(
      'og:description',
      `PandaKing9 为您定制的${safeText(data.value.destination) || '行程'}方案${data.value.guestPrice != null ? `，对客总价 ¥${data.value.guestPrice.toLocaleString()}` : ''}`,
      )
      await loadFeedback()
  } catch {
    notFound.value = true
    document.title = '协作链接无效 · PandaKing9'
  } finally {
    loading.value = false
  }
})

async function onSend() {
  if (!feedback.value.trim()) {
    sendErr.value = '请填写反馈内容'
    return
  }
  submitting.value = true
  sendErr.value = ''
  try {
    await submitH5Feedback(token, feedback.value.trim(), authorName.value.trim() || undefined)
    thanks.value = true
    feedback.value = ''
    if (data.value) await loadFeedback()
  } catch (e: any) {
    sendErr.value = e?.response?.data?.message || '提交失败'
  } finally {
    submitting.value = false
  }
}
function goHome() {
  router.push('/routes/kanban')
}
</script>

<template>
  <div class="h5">
    <div v-if="loading" class="center">加载中…</div>

    <div v-else-if="notFound" class="center">
      <p>协作链接无效或已过期</p>
      <button class="btn btn-primary" @click="goHome">返回工作台</button>
    </div>

    <div v-else-if="data" class="h5-card">
      <h1 class="h5-title">{{ safeText(data.destination) || '定制行程' }}</h1>
      <div class="h5-meta">
        <span>版本: {{ data.version }}</span>
        <span>状态: {{ statusLabel(data.statusKey) }}</span>
        <span>人数: {{ data.groupSize }}</span>
      </div>
      <div v-if="data.guestPrice != null" class="h5-price">
        对客总价: <b>¥{{ data.guestPrice.toLocaleString() }}</b>
      </div>

      <h3>行程安排</h3>
      <div v-if="days.length">
        <div v-for="(d, i) in days" :key="i" class="day">
          <b>第 {{ d.day ?? i + 1 }} 天 · {{ d.city }}</b>
          <div v-if="d.spots?.length" class="line">景点：{{ d.spots.filter(Boolean).join('、') || '—' }}</div>
          <div v-if="d.hotel" class="line">住宿：{{ d.hotel }}</div>
          <div v-if="d.meals?.length" class="line">餐饮：{{ d.meals.filter(Boolean).join('、') || '—' }}</div>
        </div>
      </div>
      <p v-else class="muted">暂无行程详情</p>

      <div class="h5-feedback">
        <h3>修改反馈</h3>
        <input v-model="authorName" class="h5-input" placeholder="您的名称（可选）" />
        <textarea v-model="feedback" class="h5-input" rows="4" placeholder="请输入您的修改意见…"></textarea>
        <button class="btn btn-primary" :disabled="submitting" @click="onSend">
          {{ submitting ? '提交中…' : '提交反馈' }}
        </button>
        <p v-if="sendErr" class="err">{{ sendErr }}</p>
        <p v-if="thanks" class="thanks">感谢反馈，已提交！</p>
      </div>

      <div v-if="feedbackList.length" class="h5-fb-history">
        <h3>已提交的反馈</h3>
        <ul class="h5-fb-list">
          <li v-for="fb in feedbackList" :key="fb.id" class="h5-fb-item">
            <div class="h5-fb-meta">
              <b>{{ fb.authorName || '协作方' }}</b>
              <span class="h5-fb-time">{{ fmtTime(fb.createdAt) }}</span>
            </div>
            <p class="h5-fb-content">{{ fb.content }}</p>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.h5 { max-width: 480px; margin: 0 auto; padding: 16px; font-family: -apple-system, "PingFang SC", sans-serif; }
.center { text-align: center; padding: 48px 0; color: var(--muted); }
.h5-card { background: var(--card); border-radius: 14px; padding: 18px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.h5-title { font-size: 22px; margin: 0 0 10px; }
.h5-meta { display: flex; flex-wrap: wrap; gap: 12px; color: var(--muted); font-size: 13px; }
.h5-price { margin: 12px 0; font-size: 16px; }
.h5-price b { color: var(--brand); }
.day { border-top: 1px solid var(--line); padding: 10px 0; }
.line { color: var(--ink); font-size: 14px; margin: 2px 0; }
.muted { color: var(--muted); }
.h5-feedback { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 14px; }
.h5-input { width: 100%; margin: 8px 0; padding: 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; box-sizing: border-box; font-family: inherit; }
.thanks { color: var(--ok); margin-top: 8px; }
.err { color: var(--danger); margin-top: 8px; }
h3 { font-size: 15px; margin: 14px 0 0; }
.h5-fb-history { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 14px; }
.h5-fb-list { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.h5-fb-item { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; }
.h5-fb-meta { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
.h5-fb-meta b { color: var(--ink); }
.h5-fb-time { margin-left: auto; }
.h5-fb-content { margin: 6px 0 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
</style>
