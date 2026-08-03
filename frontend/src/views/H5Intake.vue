<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { submitIntake, getIntakeMeta } from '@/api/routes'
import { copyText } from '@/utils/share'
import type { IntakeDraft, ItineraryDay } from '@/types'

const route = useRoute()
const token = route.params.token as string

// 提交链接归属机构名：用于顶部品牌条标题 + 全屏平印水印（强归属 / 防截图冒用）
const agencyName = ref('')
const displayAgency = computed(() => agencyName.value?.trim() || 'PandaKing9 合作机构')
// 平铺水印文本：机构名重复填充，配合 CSS 旋转 + 低透明度铺满全屏
const watermarkText = computed(() => Array(160).fill(displayAgency.value).join('   ·   '))

const customerName = ref('')
const customerNameCn = ref('')
const country = ref('')
const destination = ref('')
// 必填项是否全部填写（实时校验，用于按钮禁用 + 红框高亮）
const canSubmit = computed(
  () => customerName.value.trim() && country.value.trim() && destination.value.trim(),
)
const groupSize = ref<number>(1)
const travelDate = ref('')
// —— 行程按天结构化录入（选填，不强制）——
const days = ref<ItineraryDay[]>([newDay(1)])
function newDay(n: number): ItineraryDay {
  return { day: n, city: '', spots: [''], hotel: '', meals: [''], notes: '' }
}
function addDay() {
  days.value.push(newDay(days.value.length + 1))
}
function removeDay(i: number) {
  if (days.value.length <= 1) return
  days.value.splice(i, 1)
  days.value.forEach((d, idx) => (d.day = idx + 1))
}
function addSpot(d: ItineraryDay) {
  d.spots.push('')
}
function removeSpot(d: ItineraryDay, i: number) {
  d.spots.splice(i, 1)
}
function addMeal(d: ItineraryDay) {
  d.meals.push('')
}
function removeMeal(d: ItineraryDay, i: number) {
  d.meals.splice(i, 1)
}

const loading = ref(false)
const submitted = ref(false)
const routeId = ref('')
const agencyLink = ref('') // 提交成功后后端返回的境外社协作 H5 链接（完整 URL）
const sendErr = ref('')
const summary = ref('')
const copied = ref(false)

function buildItineraryText(): string {
  const lines = days.value
    .map((d) => {
      const parts: string[] = []
      if (d.city.trim()) parts.push(d.city.trim())
      if (d.hotel.trim()) parts.push(`住${d.hotel.trim()}`)
      const spots = d.spots.map((s) => s.trim()).filter(Boolean)
      if (spots.length) parts.push(`景点:${spots.join('/')}`)
      const meals = d.meals.map((m) => m.trim()).filter(Boolean)
      if (meals.length) parts.push(`餐:${meals.join('/')}`)
      if (d.notes.trim()) parts.push(`备注:${d.notes.trim()}`)
      return parts.length ? `D${d.day} ${parts.join(' ')}` : ''
    })
    .filter(Boolean)
  return lines.join('\n')
}

function buildSummary() {
  const base = [
    '【路线提交已收到】',
    `客户：${customerNameCn.value.trim() || customerName.value.trim()}`,
    `国家：${country.value.trim()}`,
    `目的地：${destination.value.trim()}`,
    `人数：${groupSize.value || 1}`,
    travelDate.value ? `出行日期：${travelDate.value}` : '',
  ]
  const itin = buildItineraryText()
  if (itin) base.push('行程安排：', itin)
  return base.join('\n')
}

async function onSubmit() {
  sendErr.value = ''
  if (!customerName.value.trim() || !country.value.trim() || !destination.value.trim()) {
    sendErr.value = '客户名称、国家、目的地为必填项'
    return
  }
  // 行程：仅在有内容时入库（选填）
  const itinDays = days.value.map((d) => ({
    day: d.day,
    city: d.city.trim(),
    hotel: d.hotel.trim(),
    spots: d.spots.map((s) => s.trim()).filter(Boolean),
    meals: d.meals.map((m) => m.trim()).filter(Boolean),
    notes: d.notes.trim(),
  }))
  const hasItin = itinDays.some(
    (d) => d.city || d.hotel || d.notes || d.spots.length || d.meals.length,
  )
  const draft: IntakeDraft = {
    customerName: customerName.value.trim(),
    customerNameCn: customerNameCn.value.trim() || undefined,
    country: country.value.trim(),
    destination: destination.value.trim(),
    groupSize: Number(groupSize.value) || 1,
    travelDate: travelDate.value || null,
    itinerary: hasItin ? { days: itinDays } : null,
  }
  loading.value = true
  try {
    const res = await submitIntake(token, draft)
    routeId.value = res.routeId
    // 拼完整 URL，便于境外社直接打开 / 复制跟进
    agencyLink.value = res.agencyLink
      ? `${window.location.origin}${res.agencyLink}`
      : ''
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
  // 复制给 PandaKing 同步：摘要 + 协作链接，一段到位（境外社也借此保留自己的回访链接）
  const text = agencyLink.value
    ? `${summary.value}\n\n—— 您的路线协作链接（可随时回访 / 跟进 PandaKing 反馈）——\n${agencyLink.value}`
    : summary.value
  const ok = await copyText(text)
  copied.value = ok
  setTimeout(() => (copied.value = false), 2000)
}

onMounted(async () => {
  document.title = '提交路线初稿 · PandaKing9'
  // 拉取提交链接归属机构名（免登录）；失效/无效 → 静默降级为通用品牌名
  try {
    const meta = await getIntakeMeta(token)
    if (meta?.agencyName) {
      agencyName.value = meta.agencyName
      document.title = `${meta.agencyName} · 提交路线初稿 · PandaKing9`
    }
  } catch {
    /* 保持默认品牌名，不显式报错（表单仍可正常提交，token 真伪由提交时校验） */
  }
})
</script>

<template>
  <div class="h5">
    <!-- 全屏平铺水印：机构名，强归属 / 防截图冒用；pointer-events:none 不挡表单交互 -->
    <div class="wm" aria-hidden="true">{{ watermarkText }}</div>

    <!-- 品牌条：机构名 + 提交/成功 状态（提交成功页同步沿用） -->
    <div class="h5-brand">
      <span class="brand-ico">🧳</span>
      <div class="brand-txt">
        <div class="brand-name">{{ displayAgency }}</div>
        <div class="brand-sub">{{ submitted ? '提交成功' : '提交路线初稿' }}</div>
      </div>
    </div>

    <div v-if="submitted" class="h5-card">
      <p class="hint">您的路线初稿已提交给 PandaKing，我们将尽快确认并规划。</p>
      <div v-if="summary" class="notify-box">
        <div class="notify-head">
          <span>📋 提交摘要 + 协作链接（复制发给 PandaKing 同步）</span>
          <button class="btn ghost sm" @click="onCopySummary">{{ copied ? '已复制 ✓' : '复制' }}</button>
        </div>
        <pre class="notify-text">{{ summary }}</pre>
        <div v-if="agencyLink" class="link-line">
          <span class="link-lab">🔗 您的路线协作链接：</span>
          <a :href="agencyLink" target="_blank" rel="noopener">{{ agencyLink }}</a>
        </div>
        <p class="hint" style="margin:8px 0 0;">PandaKing 规划或回传反馈后，重新打开此链接即可看到最新进展。</p>
      </div>
    </div>

    <div v-else class="h5-card">
      <p class="hint">请填写路线基本信息，提交后 PandaKing 将收到并进入规划确认流程。</p>

      <label class="h5-label">客户名称（外文）<span class="req">*</span></label>
      <input v-model="customerName" class="h5-input" :class="{ invalid: !customerName.trim() }" placeholder="如 Smith Family" />

      <label class="h5-label">客户中文名</label>
      <input v-model="customerNameCn" class="h5-input" placeholder="如 史密斯一家（选填）" />

      <label class="h5-label">国家<span class="req">*</span></label>
      <input v-model="country" class="h5-input" :class="{ invalid: !country.trim() }" placeholder="如 美国" />

      <label class="h5-label">目的地<span class="req">*</span></label>
      <input v-model="destination" class="h5-input" :class="{ invalid: !destination.trim() }" placeholder="如 北京 / 上海" />

      <label class="h5-label">人数</label>
      <input v-model.number="groupSize" class="h5-input" type="number" min="1" placeholder="如 10" />

      <label class="h5-label">出行日期</label>
      <input v-model="travelDate" class="h5-input" type="date" />

      <div class="itin-block">
        <div class="itin-head">
          <label class="h5-label" style="margin:12px 0 6px;">行程安排（选填）</label>
          <span class="itin-hint">按 D1–Dn 填写，可留空，与后续多轮沟通保持一致</span>
        </div>

        <div v-for="(d, di) in days" :key="di" class="day-card-mini">
          <div class="day-card-mini-head">
            <span class="day-badge-mini">D{{ d.day }}</span>
            <button v-if="days.length > 1" class="mini-del" type="button" @click="removeDay(di)">×</button>
          </div>
          <input v-model="d.city" class="h5-input" placeholder="城市 / 区域（如 成都）" />
          <input v-model="d.hotel" class="h5-input" placeholder="住宿酒店（选填）" />
          <div v-for="(s, si) in d.spots" :key="'s' + si" class="inline-mini">
            <input v-model="d.spots[si]" class="h5-input" placeholder="景点 / 活动（选填）" />
            <button class="mini-del" type="button" @click="removeSpot(d, si)">×</button>
          </div>
          <button class="mini-add-line" type="button" @click="addSpot(d)">＋ 添加景点</button>
          <div v-for="(m, mi) in d.meals" :key="'m' + mi" class="inline-mini">
            <input v-model="d.meals[mi]" class="h5-input" placeholder="餐饮安排（选填）" />
            <button class="mini-del" type="button" @click="removeMeal(d, mi)">×</button>
          </div>
          <button class="mini-add-line" type="button" @click="addMeal(d)">＋ 添加餐饮</button>
          <input v-model="d.notes" class="h5-input" placeholder="当天备注（选填）" />
        </div>

        <button class="day-add-btn" type="button" @click="addDay">＋ 添加一天</button>
      </div>

      <p v-if="sendErr" class="err">{{ sendErr }}</p>
      <button class="btn btn-primary" :disabled="!canSubmit || loading" @click="onSubmit">
        {{ loading ? '提交中…' : '提交路线初稿' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.h5 { position: relative; max-width: 480px; margin: 0 auto; padding: 16px; font-family: -apple-system, "PingFang SC", sans-serif; }
.h5-card { background: var(--card); border-radius: 14px; padding: 18px; box-shadow: 0 2px 12px rgba(0,0,0,.06); }
.hint { color: var(--ink); font-size: 14px; line-height: 1.6; margin: 0 0 14px; }

/* —— 顶部品牌条：机构名 + 提交/成功 状态 —— */
.h5-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 14px;
  background: #E6F1FB;
  border: 1px solid #CFE3FA;
  border-radius: 12px;
}
.brand-ico { font-size: 26px; line-height: 1; flex: none; }
.brand-txt { min-width: 0; }
.brand-name {
  font-size: 17px;
  font-weight: 800;
  color: var(--brand);
  line-height: 1.2;
  word-break: break-word;
}
.brand-sub { font-size: 13px; color: #3B6EA5; margin-top: 2px; }

/* —— 全屏平铺水印：机构名防截图冒用；不挡交互 —— */
.wm {
  position: fixed;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  transform: rotate(-20deg);
  font-size: 20px;
  line-height: 2.4;
  letter-spacing: 1px;
  color: var(--brand);
  opacity: 0.06;
  white-space: pre-wrap;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  z-index: 50;
}
.h5-label { font-size: 13px; color: var(--muted); display: block; margin: 12px 0 6px; }
.h5-input { width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 15px; box-sizing: border-box; font-family: inherit; }
.h5-input.invalid { border-color: var(--danger); background: #FCEBEB; }
.btn-primary { width: 100%; margin-top: 16px; background: var(--brand); color: #fff; border: none; border-radius: 10px; padding: 12px; font-weight: 700; cursor: pointer; }
.btn-primary:disabled { opacity: 1; background: var(--muted); cursor: not-allowed; }
.err { color: var(--danger); margin-top: 10px; }
.notify-box { margin-top: 14px; border: 1px solid var(--brand); border-radius: 10px; padding: 10px 12px; background: rgba(59,130,246,.06); }
.notify-head { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--brand); }
.notify-head .btn { margin-left: auto; }
.notify-text { margin: 8px 0 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.6; color: var(--ink); font-family: inherit; }
.link-line { margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--line); font-size: 13px; line-height: 1.5; word-break: break-all; }
.link-lab { color: var(--muted); margin-right: 2px; }
.link-line a { color: var(--brand); text-decoration: none; }
.link-line a:hover { text-decoration: underline; }
.itin-block { margin-top: 4px; }
.itin-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.itin-hint { font-size: 11px; color: var(--muted); text-align: right; }
.day-card-mini { border: 1px solid var(--line); border-radius: 10px; padding: 10px; margin-top: 10px; background: rgba(0,0,0,.02); }
.day-card-mini-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
.day-badge-mini { font-weight: 700; color: var(--brand); font-size: 14px; }
.inline-mini { display: flex; gap: 6px; align-items: center; margin-top: 6px; }
.inline-mini .h5-input { flex: 1; }
.mini-del { border: none; background: rgba(0,0,0,.06); color: var(--muted); border-radius: 6px; width: 30px; height: 38px; font-size: 16px; cursor: pointer; flex: none; }
.mini-add-line { margin-top: 6px; border: none; background: transparent; color: var(--brand); font-size: 13px; cursor: pointer; padding: 4px 0; }
.day-add-btn { margin-top: 10px; width: 100%; border: 1px dashed var(--brand); color: var(--brand); border-radius: 8px; background: transparent; padding: 10px; cursor: pointer; font-size: 14px; }
</style>
