<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { fetchH5Route, submitH5Feedback } from '@/api/h5'
import type { H5Route } from '@/types'

const { t } = useI18n()
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

onMounted(async () => {
  try {
    data.value = await fetchH5Route(token)
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }
})

async function onSend() {
  if (!feedback.value.trim()) return
  submitting.value = true
  try {
    await submitH5Feedback(token, feedback.value.trim(), authorName.value.trim() || undefined)
    thanks.value = true
    feedback.value = ''
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
    <div v-if="loading" class="center">{{ t('common.loading') }}</div>

    <div v-else-if="notFound" class="center">
      <p>{{ t('h5.notFound') }}</p>
      <button class="btn btn-primary" @click="goHome">{{ t('h5.backToHome') }}</button>
    </div>

    <div v-else-if="data" class="h5-card">
      <h1 class="h5-title">{{ data.destination }}</h1>
      <div class="h5-meta">
        <span>{{ t('h5.version') }}: {{ data.version }}</span>
        <span>{{ t('h5.status') }}: {{ data.statusKey }}</span>
        <span>{{ t('common.role') }}: {{ data.groupSize }}</span>
      </div>
      <div v-if="data.guestPrice != null" class="h5-price">
        {{ t('h5.guestPrice') }}: <b>¥{{ data.guestPrice.toLocaleString() }}</b>
      </div>

      <h3>{{ t('h5.itinerary') }}</h3>
      <pre class="h5-itinerary">{{ JSON.stringify(data.itinerary, null, 2) }}</pre>

      <div class="h5-feedback">
        <h3>{{ t('h5.feedback') }}</h3>
        <input v-model="authorName" class="h5-input" :placeholder="t('account.yourName')" />
        <textarea
          v-model="feedback"
          class="h5-input"
          rows="4"
          :placeholder="t('h5.feedbackPlaceholder')"
        ></textarea>
        <button class="btn btn-primary" :disabled="submitting" @click="onSend">
          {{ t('h5.submitFeedback') }}
        </button>
        <p v-if="thanks" class="h5-thanks">{{ t('h5.feedbackThanks') }}</p>
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
.h5-itinerary { background: var(--bg); border-radius: 10px; padding: 12px; font-size: 13px; white-space: pre-wrap; word-break: break-word; }
.h5-feedback { margin-top: 18px; border-top: 1px solid var(--line); padding-top: 14px; }
.h5-input { width: 100%; margin: 8px 0; padding: 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; box-sizing: border-box; font-family: inherit; }
.h5-thanks { color: var(--ok); margin-top: 8px; }
h3 { font-size: 15px; margin: 14px 0 0; }
</style>
