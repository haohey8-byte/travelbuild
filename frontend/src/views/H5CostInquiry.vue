<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchH5CostInquiry, submitH5CostInquiry } from '@/api/h5'
import { safeName, safeText } from '@/utils/name'
import { collabNotifyText, copyText } from '@/utils/share'
import type { H5CostInquiry } from '@/types'

const route = useRoute()
const router = useRouter()
const token = route.params.token as string

const data = ref<H5CostInquiry | null>(null)
const notFound = ref(false)
const loading = ref(true)
const cost1 = ref<number | null>(null)
const submitting = ref(false)
const thanks = ref(false)
const sendErr = ref('')
const notifyText = ref('')
const notifyTip = ref('')
const alreadySubmitted = ref(false)

const subject = computed(() =>
  data.value ? safeName(data.value.route.customerNameCn, data.value.route.customerName) : '',
)
const destination = computed(() => data.value?.route.destination || '')

function fmtTime(s?: string): string {
  if (!s) return ''
  try {
    return new Date(s).toLocaleString()
  } catch {
    return s
  }
}

onMounted(async () => {
  try {
    const d = await fetchH5CostInquiry(token)
    data.value = d
    if (d.status === 'submitted') {
      alreadySubmitted.value = true
      cost1.value = d.cost1
    }
    const title = `${safeText(d.route.destination) || '行程'} · 成本询价`
    document.title = title
  } catch {
    notFound.value = true
    document.title = '询价链接无效 · PandaKing9'
  } finally {
    loading.value = false
  }
})

async function onSubmit() {
  if (cost1.value == null || Number.isNaN(Number(cost1.value)) || Number(cost1.value) < 0) {
    sendErr.value = '请填写有效的成本①（非负数字）'
    return
  }
  submitting.value = true
  sendErr.value = ''
  try {
    await submitH5CostInquiry(token, Number(cost1.value))
    thanks.value = true
    alreadySubmitted.value = true
    if (data.value) {
      const text = collabNotifyText({
        kind: 'plan',
        eventLabel: '回传了成本询价',
        subject: subject.value,
        destination: destination.value,
        authorName: '省地接社',
        detail: `成本① ¥${Number(cost1.value).toLocaleString()}`,
        url: window.location.href,
      })
      notifyText.value = text
      const ok = await copyText(text)
      notifyTip.value = ok
        ? '通知文案已复制，去微信粘贴发给一手同步 ✅'
        : '通知文案已生成，请长按上方文字手动复制'
    }
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
      <p>询价链接无效或已失效</p>
      <button class="btn btn-primary" @click="goHome">返回工作台</button>
    </div>

    <div v-else-if="data" class="h5-card">
      <h1 class="h5-title">{{ safeText(data.route.destination) || '定制行程' }} · 成本询价</h1>
      <div class="h5-meta">
        <span>客户: {{ safeName(data.route.customerNameCn, data.route.customerName) || '—' }}</span>
        <span>人数: {{ data.route.groupSize }}</span>
      </div>

      <div v-if="alreadySubmitted" class="submitted">
        <p>✅ 您已回传成本询价，无需重复提交。</p>
        <p v-if="data.cost1 != null" class="cost-readonly">
          成本①：<b>¥{{ Number(data.cost1).toLocaleString() }}</b>
        </p>
      </div>

      <template v-else>
        <p class="hint">
          请填写本路线的<b>地接成本①</b>（仅一手可见）。提交后系统会生成通知文案，复制发到微信即可同步一手。
        </p>
        <label class="h5-label">成本①（地接成本，¥）</label>
        <input
          v-model.number="cost1"
          class="h5-input"
          type="number"
          min="0"
          placeholder="如 12000"
        />
        <button class="btn btn-primary" :disabled="submitting" @click="onSubmit">
          {{ submitting ? '提交中…' : '提交成本询价' }}
        </button>
        <p v-if="sendErr" class="err">{{ sendErr }}</p>
      </template>

      <p v-if="thanks" class="thanks">感谢回传，已提交！</p>

      <div v-if="notifyText" class="notify-box">
        <div class="notify-head">
          <span>📋 {{ notifyTip || '通知文案（去微信粘贴发给一手）' }}</span>
          <button class="btn ghost sm" @click="copyText(notifyText)">再复制</button>
        </div>
        <pre class="notify-text">{{ notifyText }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.h5 { max-width: 480px; margin: 0 auto; padding: 16px; font-family: -apple-system, "PingFang SC", sans-serif; }
.center { text-align: center; padding: 48px 0; color: var(--muted); }
.h5-card { background: var(--card); border-radius: 14px; padding: 18px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.h5-title { font-size: 20px; margin: 0 0 10px; }
.h5-meta { display: flex; flex-wrap: wrap; gap: 12px; color: var(--muted); font-size: 13px; }
.hint { color: var(--ink); font-size: 14px; line-height: 1.6; margin: 14px 0; }
.h5-label { font-size: 13px; color: var(--muted); display: block; margin-bottom: 6px; }
.h5-input { width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 15px; box-sizing: border-box; font-family: inherit; }
.btn-primary { width: 100%; margin-top: 12px; background: var(--brand); color: #fff; border: none; border-radius: 10px; padding: 12px; font-weight: 700; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; }
.submitted { margin: 14px 0; padding: 12px; border: 1px solid var(--brand); border-radius: 10px; background: rgba(59,130,246,.06); }
.cost-readonly b { color: var(--brand); font-size: 16px; }
.thanks { color: var(--ok); margin-top: 8px; }
.err { color: var(--danger); margin-top: 8px; }
.notify-box { margin-top: 12px; border: 1px solid var(--brand); border-radius: 10px; padding: 10px 12px; background: rgba(59,130,246,.06); }
.notify-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--brand); }
.notify-head .btn { margin-left: auto; }
.notify-text { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6; color: var(--ink); font-family: inherit; }
</style>
