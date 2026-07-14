<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useRouteStore } from '@/stores/route'
import { createRoute } from '@/api/routes'
import { safeName, safeText } from '@/utils/name'
import type { Route, RouteStatusKey } from '@/types'

const router = useRouter()
const store = useRouteStore()
const { routes, loading } = storeToRefs(store)

const STATUS_LABEL: Record<RouteStatusKey, string> = {
  consulting: '咨询中',
  awaiting_pk_confirm: '待一手确认',
  awaiting_agency_revision: '待旅行社修订',
  awaiting_quote: '待报价',
  awaiting_feedback: '待反馈',
  awaiting_confirm: '待确认',
  confirmed: '已确认',
  lost: '已流失',
}
const STATUSES = Object.keys(STATUS_LABEL) as RouteStatusKey[]

function displayName(r: Route): string {
  return safeName(r.customerNameCn, r.customerName)
}

const stats = computed(() => {
  const m: Record<string, number> = { all: routes.value.length }
  for (const s of STATUSES) m[s] = 0
  for (const r of routes.value) m[r.statusKey] = (m[r.statusKey] ?? 0) + 1
  return m
})

const filter = ref<'all' | RouteStatusKey>('all')
const filtered = computed(() =>
  filter.value === 'all' ? routes.value : routes.value.filter((r) => r.statusKey === filter.value),
)

onMounted(() => store.load())

// 操作指引浮层：首次访问自动弹出，关闭后写入 localStorage 不再打扰；右下角 ? 可随时重看
const GUIDE_KEY = 'pk_guide_dismissed'
const showGuide = ref(localStorage.getItem(GUIDE_KEY) !== '1')
function dismissGuide() {
  showGuide.value = false
  localStorage.setItem(GUIDE_KEY, '1')
}
function openGuide() {
  showGuide.value = true
}

function open(r: Route) {
  router.push(`/routes/${r.id}`)
}
function verLabel(r: Route) {
  return r.versions?.[0]?.version ?? r.version ?? 'v1'
}

// 创建路线弹窗
const showCreate = ref(false)
const creating = ref(false)
const createErr = ref('')
const form = ref({
  customerName: '',
  customerNameCn: '',
  destination: '',
  country: 'China',
  agency: '',
  groupSize: 1,
  travelDate: '',
  modeKey: 'collab' as 'collab' | 'solo',
})

async function onCreate() {
  createErr.value = ''
  if (!form.value.customerName.trim() || !form.value.destination.trim()) {
    createErr.value = '请填写客户名（英文）和目的地'
    return
  }
  creating.value = true
  try {
    await createRoute({
      customerName: form.value.customerName.trim(),
      customerNameCn: form.value.customerNameCn.trim() || undefined,
      destination: form.value.destination.trim(),
      country: form.value.country.trim() || 'China',
      // 始终发送 agency：空白时传空字符串，避免后端 NOT NULL 约束触发 500
      agency: form.value.agency.trim(),
      groupSize: Number(form.value.groupSize) || 1,
      travelDate: form.value.travelDate || undefined,
      modeKey: form.value.modeKey,
    })
    showCreate.value = false
    form.value = {
      customerName: '',
      customerNameCn: '',
      destination: '',
      country: 'China',
      agency: '',
      groupSize: 1,
      travelDate: '',
      modeKey: 'collab',
    }
    await store.load()
  } catch (e: any) {
    console.error('创建路线失败:', e)
    createErr.value = e?.response?.data?.message || e?.message || '创建失败，请检查网络或刷新后重试'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">路线管理 · 看板</h1>
      <button class="btn btn-primary" @click="showCreate = true">+ 创建路线</button>
    </div>

    <div class="stats">
      <button class="chip" :class="{ on: filter === 'all' }" @click="filter = 'all'">
        全部 <b>{{ stats.all }}</b>
      </button>
      <button
        v-for="s in STATUSES"
        :key="s"
        class="chip"
        :class="{ on: filter === s }"
        @click="filter = s"
      >
        {{ STATUS_LABEL[s] }} <b>{{ stats[s] }}</b>
      </button>
    </div>

    <p v-if="loading">加载中…</p>
    <div v-else class="kanban-grid">
      <div v-for="r in filtered" :key="r.id" class="card" @click="open(r)">
        <div class="route-name">{{ displayName(r) }}</div>
        <div class="route-meta">{{ safeText(r.destination) || '未填目的地' }} · {{ verLabel(r) }} · {{ r.modeKey === 'collab' ? '协作' : '自营' }}</div>
        <span class="badge" :class="r.statusKey">{{ STATUS_LABEL[r.statusKey] }}</span>
        <div class="route-agency" v-if="safeText(r.agency)">旅行社：{{ safeText(r.agency) }}</div>
      </div>
      <p v-if="!filtered.length" class="muted">暂无路线</p>
    </div>

    <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
      <div class="modal">
        <form @submit.prevent="onCreate">
          <h2>创建新路线</h2>
          <label>
            <span>客户名（英文）*</span>
            <input v-model="form.customerName" type="text" placeholder="Smith Family" autocomplete="off" />
          </label>
          <label>
            <span>客户中文名</span>
            <input v-model="form.customerNameCn" type="text" placeholder="史密斯一家" autocomplete="off" />
          </label>
          <label>
            <span>目的地 *</span>
            <input v-model="form.destination" type="text" placeholder="成都·九寨" autocomplete="off" />
          </label>
          <label>
            <span>国家</span>
            <input v-model="form.country" type="text" placeholder="China" autocomplete="off" />
          </label>
          <label>
            <span>旅行社</span>
            <input v-model="form.agency" type="text" placeholder="境外旅行社名称" autocomplete="off" />
          </label>
          <label>
            <span>人数</span>
            <input v-model.number="form.groupSize" type="number" min="1" />
          </label>
          <label>
            <span>出行日期</span>
            <input v-model="form.travelDate" type="date" />
          </label>
          <label>
            <span>模式</span>
            <select v-model="form.modeKey">
              <option value="collab">协作（旅行社发起草案）</option>
              <option value="solo">自营（一手直接报价）</option>
            </select>
          </label>
          <p v-if="createErr" class="err">{{ createErr }}</p>
          <div class="modal-actions">
            <button type="button" class="btn" :disabled="creating" @click="showCreate = false">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="creating">{{ creating ? '创建中...' : '创建' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 操作指引浮层 -->
    <div
      v-if="showGuide"
      class="modal-backdrop"
      @click.self="dismissGuide"
      role="dialog"
      aria-modal="true"
      aria-label="操作指引"
    >
      <div class="modal guide" @keydown.esc="dismissGuide">
        <button class="guide-close" @click="dismissGuide" aria-label="关闭指引">×</button>
        <h2>👋 欢迎使用协作工作台</h2>
        <p class="guide-sub">三步，把一份路线做成可发给客户的 H5：</p>
        <ol class="guide-steps">
          <li>
            <b>创建路线</b><br />
            点右上角「+ 创建路线」，填客户英文名、目的地，<b>旅行社为必填项</b>。
          </li>
          <li>
            <b>编辑行程与报价</b><br />
            进入详情页，按天排城市 / 景点 / 住宿 / 餐饮；右侧 5 级报价填成本 + 加价，自动算出<b>对客总价</b>。
          </li>
          <li>
            <b>保存并通知</b><br />
            点「保存并通知」生成 H5 协作链接，复制发给客户。客户打开即看到目的地、状态、对客价。
          </li>
        </ol>
        <p class="guide-tip">
          💡 页面顶部可切换「一手 / 境外旅行社 / 省地接社」三种视角对比同一份路线。H5 链接建议用<b>无痕窗口或手机</b>打开（模拟客户视角）。
        </p>
        <div class="modal-actions">
          <button class="btn btn-primary" @click="dismissGuide">开始使用</button>
        </div>
      </div>
    </div>

    <!-- 帮助按钮：随时重看操作指引 -->
    <button class="help-fab" @click="openGuide" aria-label="查看操作指引" title="操作指引">?</button>
  </div>
</template>

<style scoped>
.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.page-title { margin: 0; }
.stats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.chip { padding: 6px 12px; border: 1px solid var(--line); border-radius: 999px; background: var(--card); cursor: pointer; font-size: 13px; }
.chip.on { border-color: var(--brand); color: var(--brand); }
.chip b { margin-left: 4px; }
.kanban-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.card { padding: 14px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; cursor: pointer; transition: box-shadow 0.15s, transform 0.05s; position: relative; }
.card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); transform: translateY(-2px); }
.route-name { font-weight: 600; }
.route-meta { color: var(--muted); font-size: 13px; margin-top: 4px; }
.route-agency { color: var(--muted); font-size: 12px; margin-top: 6px; }
.badge { display: inline-block; margin-top: 8px; font-size: 12px; padding: 2px 8px; border-radius: 6px; background: var(--bg); color: var(--muted); }
.badge.awaiting_pk_confirm { background: #fff4e5; color: #b76e00; }
.badge.awaiting_quote { background: #e8f0fe; color: #2f80ed; }
.badge.awaiting_confirm { background: #e6f7ef; color: #1aab8a; }
.badge.confirmed { background: #e6f7ef; color: #1aab8a; }
.badge.lost { background: #fdeaea; color: #e2483d; }
.muted { color: var(--muted); }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--card); border-radius: 14px; padding: 24px; width: 90%; max-width: 440px; box-shadow: 0 16px 40px rgba(0,0,0,0.2); max-height: 90vh; overflow: auto; }
.modal h2 { margin: 0 0 16px; font-size: 18px; }
.modal label { display: block; margin-bottom: 12px; }
.modal label span { display: block; font-size: 13px; color: var(--muted); margin-bottom: 4px; }
.modal input, .modal select { width: 100%; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: inherit; box-sizing: border-box; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.err { color: var(--danger); font-size: 13px; }
.guide { max-width: 480px; position: relative; }
.guide-close { position: absolute; top: 8px; right: 12px; background: none; border: none; font-size: 24px; line-height: 1; color: var(--muted); cursor: pointer; padding: 4px; }
.guide-close:hover { color: var(--txt); }
.guide-sub { color: var(--muted); margin: 0 0 14px; font-size: 14px; }
.guide-steps { margin: 0; padding-left: 20px; }
.guide-steps li { margin-bottom: 14px; line-height: 1.65; font-size: 14px; }
.guide-steps b { color: var(--brand); }
.guide-tip { background: rgba(96,165,250,0.1); border: 1px solid rgba(96,165,250,0.3); border-radius: 10px; padding: 10px 12px; font-size: 13px; color: var(--muted); margin: 16px 0 4px; line-height: 1.6; }
.guide-tip b { color: var(--brand); }
.help-fab { position: fixed; right: 20px; bottom: 20px; width: 44px; height: 44px; border-radius: 50%; background: var(--brand); color: #fff; border: none; font-size: 20px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.25); z-index: 90; display: flex; align-items: center; justify-content: center; }
.help-fab:hover { opacity: 0.9; }

@media (max-width: 560px) {
  .kanban-grid { grid-template-columns: 1fr; }
  .stats { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 6px; scrollbar-width: thin; }
  .chip { flex: 0 0 auto; }
}
</style>
