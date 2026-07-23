<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { submitIntake } from '@/api/routes'
import { copyText } from '@/utils/share'
import type { IntakeDraft } from '@/types'

const route = useRoute()
const token = route.params.token as string

const customerName = ref('')
const customerNameCn = ref('')
const country = ref('')
const destination = ref('')
const groupSize = ref<number>(1)
const travelDate = ref('')
const itineraryNote = ref('')

const loading = ref(false)
const submitted = ref(false)
const routeId = ref('')
const sendErr = ref('')
const summary = ref('')
const copied = ref(false)

function buildSummary() {
  return [
    '【路线提交已收到】',
    `客户：${customerNameCn.value.trim() || customerName.value.trim()}`,
    `国家：${country.value.trim()}`,
    `目的地：${destination.value.trim()}`,
    `人数：${groupSize.value || 1}`,
    travelDate.value ? `出行日期：${travelDate.value}` : '',
    itineraryNote.value.trim() ? `行程/需求：${itineraryNote.value.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function onSubmit() {
  sendErr.value = ''
  if (!customerName.value.trim() || !country.value.trim() || !destination.value.trim()) {
    sendErr.value = '客户名称、国家、目的地为必填项'
    return
  }
  const draft: IntakeDraft = {
    customerName: customerName.value.trim(),
    customerNameCn: customerNameCn.value.trim() || undefined,
    country: country.value.trim(),
    destination: destination.value.trim(),
    groupSize: Number(groupSize.value) || 1,
    travelDate: travelDate.value || null,
    itinerary: itineraryNote.value.trim() ? { note: itineraryNote.value.trim() } : null,
  }
  loading.value = true
  try {
    const res = await submitIntake(token, draft)
    routeId.value = res.routeId
    submitted.value = true
    summary.value = buildSummary()
    document.title = `${destination.value.trim() || '行程'} · 路线提交成功`
  } catch (e: any) {
    const code = e?.response?.data?.code
    if (code === 'INTAKE_INVALID' || code === 'INTAKE_EXPIRED') {
      sendErr.value = '提交链接无效或已过期，请联系 PandaKing 重新获取'
    } else {
      sendErr.value = e?.response?.data?.message || '提交失败，请重试'
    }
  } finally {
    loading.value = false
  }
}

async function onCopySummary() {
  if (!summary.value) return
  const ok = await copyText(summary.value)
  copied.value = ok
  setTimeout(() => (copied.value = false), 2000)
}

onMounted(() => {
  document.title = '提交路线初稿 · PandaKing9'
})
</script>

<template>
  <div class="h5">
    <div v-if="submitted" class="h5-card">
      <h1 class="h5-title">✅ 提交成功</h1>
      <p class="hint">您的路线初稿已提交给 PandaKing，我们将尽快确认并规划。</p>
      <div v-if="summary" class="notify-box">
        <div class="notify-head">
          <span>📋 提交摘要（复制发给 PandaKing 同步）</span>
          <button class="btn ghost sm" @click="onCopySummary">{{ copied ? '已复制 ✓' : '复制' }}</button>
        </div>
        <pre class="notify-text">{{ summary }}</pre>
      </div>
    </div>

    <div v-else class="h5-card">
      <h1 class="h5-title">提交路线初稿</h1>
      <p class="hint">请填写路线基本信息，提交后 PandaKing 将收到并进入规划确认流程。</p>

      <label class="h5-label">客户名称（外文）*</label>
      <input v-model="customerName" class="h5-input" placeholder="如 Smith Family" />

      <label class="h5-label">客户中文名</label>
      <input v-model="customerNameCn" class="h5-input" placeholder="如 史密斯一家（选填）" />

      <label class="h5-label">国家 *</label>
      <input v-model="country" class="h5-input" placeholder="如 美国" />

      <label class="h5-label">目的地 *</label>
      <input v-model="destination" class="h5-input" placeholder="如 北京 / 上海" />

      <label class="h5-label">人数</label>
      <input v-model.number="groupSize" class="h5-input" type="number" min="1" placeholder="如 10" />

      <label class="h5-label">出行日期</label>
      <input v-model="travelDate" class="h5-input" type="date" />

      <label class="h5-label">行程 / 需求描述</label>
      <textarea v-model="itineraryNote" class="h5-input" rows="4" placeholder="大致天数、偏好、特殊需求等（选填）"></textarea>

      <p v-if="sendErr" class="err">{{ sendErr }}</p>
      <button class="btn btn-primary" :disabled="loading" @click="onSubmit">
        {{ loading ? '提交中…' : '提交路线初稿' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.h5 { max-width: 480px; margin: 0 auto; padding: 16px; font-family: -apple-system, "PingFang SC", sans-serif; }
.h5-card { background: var(--card); border-radius: 14px; padding: 18px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.h5-title { font-size: 20px; margin: 0 0 10px; }
.hint { color: var(--ink); font-size: 14px; line-height: 1.6; margin: 0 0 14px; }
.h5-label { font-size: 13px; color: var(--muted); display: block; margin: 12px 0 6px; }
.h5-input { width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 15px; box-sizing: border-box; font-family: inherit; }
.btn-primary { width: 100%; margin-top: 16px; background: var(--brand); color: #fff; border: none; border-radius: 10px; padding: 12px; font-weight: 700; cursor: pointer; }
.btn-primary:disabled { opacity: 0.6; }
.err { color: var(--danger); margin-top: 10px; }
.notify-box { margin-top: 14px; border: 1px solid var(--brand); border-radius: 10px; padding: 10px 12px; background: rgba(59,130,246,.06); }
.notify-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--brand); }
.notify-head .btn { margin-left: auto; }
.notify-text { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6; color: var(--ink); font-family: inherit; }
</style>
