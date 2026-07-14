<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { fetchH5Route, submitH5Feedback, fetchH5Feedback, editH5ProvincialRoute } from '@/api/h5'
import { safeName, safeText } from '@/utils/name'
import { collabNotifyText, copyText } from '@/utils/share'
import type { H5Route, RouteFeedbackItem } from '@/types'

const route = useRoute()
const router = useRouter()
const token = route.params.token as string

const data = ref<H5Route | null>(null)
const notFound = ref(false)
const loading = ref(true)

// —— 行程（按天，可编辑）——
interface Day {
  day: number
  city: string
  spots: string[]
  hotel: string
  meals: string[]
}
const itinerary = ref<{ days: Day[] }>({ days: [] })
function newDay(n: number): Day {
  return { day: n, city: '', spots: [''], hotel: '', meals: [''] }
}
function parseItinerary(it: unknown) {
  const days = (it as { days?: Day[] })?.days
  if (Array.isArray(days) && days.length) {
    itinerary.value = { days: days.map((d, i) => ({ ...d, day: i + 1 })) }
  } else {
    itinerary.value = { days: [newDay(1)] }
  }
}
function addDay() {
  itinerary.value.days.push(newDay(itinerary.value.days.length + 1))
}
function removeDay(i: number) {
  itinerary.value.days.splice(i, 1)
  itinerary.value.days.forEach((d, idx) => (d.day = idx + 1))
}
function addSpot(d: Day) {
  d.spots.push('')
}
function removeSpot(d: Day, i: number) {
  d.spots.splice(i, 1)
}
function addMeal(d: Day) {
  d.meals.push('')
}
function removeMeal(d: Day, i: number) {
  d.meals.splice(i, 1)
}

// —— 行程规划反馈（与一手同步）——
const feedbackList = ref<RouteFeedbackItem[]>([])
const fbText = ref('')
const fbSending = ref(false)
const fbErr = ref('')

// —— 保存并通知 ——
const saving = ref(false)
const saveOk = ref('')
const saveErr = ref('')
const notifyText = ref('')
const notifyTip = ref('')

const subject = computed(() => (data.value ? safeName(data.value.customerNameCn, data.value.customerName) : ''))
const destination = computed(() => data.value?.destination || '')

function fmtTime(s?: string): string {
  if (!s) return ''
  try {
    return new Date(s).toLocaleString()
  } catch {
    return s
  }
}

async function loadFeedback() {
  try {
    feedbackList.value = await fetchH5Feedback(token)
  } catch {
    feedbackList.value = []
  }
}

onMounted(async () => {
  try {
    const d = await fetchH5Route(token)
    data.value = d
    parseItinerary(d.itinerary)
    document.title = `${safeText(d.destination) || '行程'} · 省地接社协作`
    await loadFeedback()
  } catch {
    notFound.value = true
    document.title = '协作链接无效 · PandaKing9'
  } finally {
    loading.value = false
  }
})

async function onSave() {
  saving.value = true
  saveErr.value = ''
  saveOk.value = ''
  notifyText.value = ''
  try {
    await editH5ProvincialRoute(token, itinerary.value)
    saveOk.value = '行程已保存并同步给一手 ✅'
    if (data.value) {
      const text = collabNotifyText({
        kind: 'plan',
        eventLabel: '更新了行程规划',
        subject: subject.value,
        destination: destination.value,
        authorName: '省地接社',
        url: window.location.href,
      })
      notifyText.value = text
      const ok = await copyText(text)
      notifyTip.value = ok
        ? '通知文案已复制，去微信粘贴发给一手同步 ✅'
        : '通知文案已生成，请长按上方文字手动复制'
    }
  } catch (e: any) {
    saveErr.value = e?.response?.data?.message || '保存失败'
  } finally {
    saving.value = false
  }
}

async function onSubmitFeedback() {
  if (!fbText.value.trim()) {
    fbErr.value = '请填写行程规划修改建议'
    return
  }
  fbSending.value = true
  fbErr.value = ''
  try {
    await submitH5Feedback(token, fbText.value.trim(), '省地接社')
    fbText.value = ''
    await loadFeedback()
  } catch (e: any) {
    fbErr.value = e?.response?.data?.message || '提交失败'
  } finally {
    fbSending.value = false
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
      <p>协作链接无效或已失效</p>
      <button class="btn btn-primary" @click="goHome">返回工作台</button>
    </div>

    <div v-else-if="data" class="h5-card">
      <h1 class="h5-title">{{ safeText(data.destination) || '定制行程' }} · 省地接社协作</h1>
      <div class="h5-meta">
        <span>客户: {{ safeName(data.customerNameCn, data.customerName) || '—' }}</span>
        <span>人数: {{ data.groupSize }}</span>
        <span v-if="data.guestPrice != null">对客总价: ¥{{ Number(data.guestPrice).toLocaleString() }}</span>
      </div>
      <p class="hint">
        您正在编辑<b>分配给本社的行程</b>。可修改城市/景点/住宿/餐饮等当地安排，保存后同步一手；
        成本①请在「成本询价」H5 中填写。下方可提交行程规划修改建议。
      </p>

      <!-- 行程编辑 -->
      <section class="edit-block">
        <h3>行程安排（按天，可编辑）</h3>
        <div v-for="(d, di) in itinerary.days" :key="di" class="day">
          <div class="day-head">
            <b>第 {{ d.day }} 天</b>
            <button class="btn ghost sm" @click="removeDay(di)">删除当天</button>
          </div>
          <label class="f">城市<input v-model="d.city" placeholder="如 成都" /></label>
          <div class="f-block">
            <span class="lbl">景点</span>
            <div v-for="(s, si) in d.spots" :key="si" class="inline">
              <input v-model="d.spots[si]" placeholder="景点名称" />
              <button class="btn ghost sm" @click="removeSpot(d, si)">×</button>
            </div>
            <button class="btn ghost sm" @click="addSpot(d)">+ 景点</button>
          </div>
          <label class="f">住宿<input v-model="d.hotel" placeholder="酒店" /></label>
          <div class="f-block">
            <span class="lbl">餐饮</span>
            <div v-for="(m, mi) in d.meals" :key="mi" class="inline">
              <input v-model="d.meals[mi]" placeholder="餐饮安排" />
              <button class="btn ghost sm" @click="removeMeal(d, mi)">×</button>
            </div>
            <button class="btn ghost sm" @click="addMeal(d)">+ 餐饮</button>
          </div>
        </div>
        <button class="btn" @click="addDay">+ 添加一天</button>
      </section>

      <button class="btn btn-primary" :disabled="saving" @click="onSave">
        {{ saving ? '保存中…' : '保存并通知（同步一手）' }}
      </button>
      <p v-if="saveErr" class="err">{{ saveErr }}</p>
      <p v-if="saveOk" class="ok">{{ saveOk }}</p>

      <div v-if="notifyText" class="notify-box">
        <div class="notify-head">
          <span>📋 {{ notifyTip || '通知文案（去微信粘贴发给一手）' }}</span>
          <button class="btn ghost sm" @click="copyText(notifyText)">再复制</button>
        </div>
        <pre class="notify-text">{{ notifyText }}</pre>
      </div>

      <!-- 行程规划反馈 -->
      <section class="edit-block fb">
        <h3>行程规划修改建议</h3>
        <p class="hint">提交后自动同步一手地接社（如「D3 景点太满，建议拆分到两天」）。</p>
        <textarea v-model="fbText" rows="3" placeholder="填写对行程规划的修改建议"></textarea>
        <button class="btn" :disabled="fbSending" @click="onSubmitFeedback">
          {{ fbSending ? '提交中…' : '提交建议' }}
        </button>
        <p v-if="fbErr" class="err">{{ fbErr }}</p>

        <ul v-if="feedbackList.length" class="fb-list">
          <li v-for="fb in feedbackList" :key="fb.id" class="fb-item">
            <div class="fb-meta">
              <b>{{ fb.authorName || (fb.source === 'h5' ? '协作方' : '一手地接社') }}</b>
              <span class="fb-time">{{ fmtTime(fb.createdAt) }}</span>
            </div>
            <p class="fb-content">{{ fb.content }}</p>
          </li>
        </ul>
        <p v-else class="muted">暂无反馈意见。</p>
      </section>
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
.edit-block { margin: 16px 0; border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
.edit-block.fb { margin-top: 18px; }
.edit-block h3 { margin: 0 0 10px; font-size: 15px; }
.day { border: 1px solid var(--line); border-radius: 10px; padding: 10px; margin-bottom: 10px; }
.day-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.f { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; font-size: 13px; color: var(--muted); }
.f input { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; }
.f-block { margin: 8px 0; }
.lbl { font-size: 13px; color: var(--muted); display: block; margin-bottom: 4px; }
.inline { display: flex; gap: 6px; margin-bottom: 6px; }
.inline input { flex: 1; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; }
.btn { width: 100%; margin-top: 8px; padding: 10px; border: 1px solid var(--line-strong); background: var(--surface); border-radius: 10px; cursor: pointer; font-size: 14px; }
.btn-primary { background: var(--brand); color: #fff; border: none; padding: 12px; font-weight: 700; }
.btn-primary:disabled { opacity: 0.6; }
.btn.ghost { background: transparent; }
.btn.ghost.sm { padding: 2px 8px; font-size: 12px; width: auto; }
textarea { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; font-family: inherit; box-sizing: border-box; }
.err { color: var(--danger); margin-top: 8px; }
.ok { color: var(--ok); margin-top: 8px; }
.notify-box { margin-top: 12px; border: 1px solid var(--brand); border-radius: 10px; padding: 10px 12px; background: rgba(59,130,246,.06); }
.notify-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--brand); }
.notify-head .btn { margin-left: auto; }
.notify-text { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6; color: var(--ink); font-family: inherit; }
.fb-list { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.fb-item { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: var(--card); }
.fb-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--muted); }
.fb-meta b { color: var(--ink); }
.fb-time { margin-left: auto; }
.fb-content { margin: 6px 0 0; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
.muted { color: var(--muted); font-size: 13px; }
</style>
