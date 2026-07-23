<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchAgencies } from '@/api/auth'
import { createIntakeLink, listIntakeLinks, copyIntakeLink } from '@/api/routes'
import { copyText } from '@/utils/share'
import type { Agency, IntakeLinkView } from '@/types'

const auth = useAuthStore()
const isAgency = auth.currentRole === 'agency'

const agencies = ref<Agency[]>([])
const loadingAgencies = ref(false)
const intakeAgencyId = ref('')
const issueLink = ref('')
const issueErr = ref('')
const issuing = ref(false)
const issueCopied = ref(false)

const intakeLinks = ref<IntakeLinkView[]>([])
const loadingIntakeLinks = ref(false)
const copiedToken = ref('')

// 一手可选全部境外旅行社；agency 仅自己（后端亦按 role 裁剪，前端预选并锁定）
const agencyOptions = computed(() => agencies.value.filter((a) => a.role === 'agency'))

function fullLink(link: string) {
  const base = import.meta.env.VITE_BASE || '/'
  return location.origin + base + '#' + link
}
function daysLeft(expiresAt: string) {
  const ms = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 3600 * 1000)))
}
function fmt(ts: string | null) {
  if (!ts) return '—'
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

async function loadAgencies() {
  loadingAgencies.value = true
  try {
    agencies.value = await fetchAgencies()
    if (isAgency && auth.user?.agencyId) intakeAgencyId.value = auth.user.agencyId
  } catch {
    agencies.value = []
  } finally {
    loadingAgencies.value = false
  }
}

async function loadIntakeLinks() {
  loadingIntakeLinks.value = true
  try {
    intakeLinks.value = await listIntakeLinks()
  } catch {
    intakeLinks.value = []
  } finally {
    loadingIntakeLinks.value = false
  }
}

async function onIssueIntake() {
  issueErr.value = ''
  issueCopied.value = false
  if (!intakeAgencyId.value) return (issueErr.value = '请选择机构')
  issuing.value = true
  try {
    const res = await createIntakeLink(intakeAgencyId.value)
    issueLink.value = fullLink(res.link)
    await loadIntakeLinks()
  } catch (e: any) {
    issueErr.value = e?.response?.data?.message || '预发链接失败'
  } finally {
    issuing.value = false
  }
}

async function copyIssue() {
  if (!issueLink.value) return
  issueCopied.value = await copyText(issueLink.value)
  setTimeout(() => (issueCopied.value = false), 2000)
}

async function copyRow(item: IntakeLinkView) {
  const ok = await copyText(fullLink(item.link))
  if (!ok) return
  copiedToken.value = item.token
  setTimeout(() => {
    if (copiedToken.value === item.token) copiedToken.value = ''
  }, 2000)
  try {
    const res = await copyIntakeLink(item.token)
    const row = intakeLinks.value.find((x) => x.token === item.token)
    if (row) {
      row.copies = res.copies
      row.lastCopiedAt = res.lastCopiedAt
    }
  } catch {
    /* 复制仍成功，仅计数失败不影响使用 */
  }
}

onMounted(() => {
  loadAgencies()
  loadIntakeLinks()
})
</script>

<template>
  <div>
    <h2 class="section-title">机构提交链接（route-intake）</h2>
    <p class="muted">
      {{ isAgency ? '为「本机构」预发一条常驻提交链接，凭链接免登录提交路线初稿；链接 30 天有效。' : '为某家境外旅行社预发一条常驻提交链接，对方凭链接免登录提交路线初稿；链接 30 天有效，可重复生成替换。' }}
    </p>

    <div class="card">
      <div class="row">
        <label>选择机构</label>
        <select v-model="intakeAgencyId" class="input" :disabled="loadingAgencies || isAgency">
          <option value="">请选择境外旅行社</option>
          <option v-for="a in agencyOptions" :key="a.id" :value="a.id">{{ a.name }} ({{ a.id }})</option>
        </select>
        <button class="btn btn-primary sm" :disabled="issuing" @click="onIssueIntake" type="button">
          {{ issuing ? '生成中…' : '预发链接' }}
        </button>
      </div>
      <p v-if="issueErr" class="err">{{ issueErr }}</p>
      <div v-if="issueLink" class="link-box">
        <input :value="issueLink" class="input" readonly />
        <button class="btn ghost sm" @click="copyIssue" type="button">{{ issueCopied ? '已复制 ✓' : '复制链接' }}</button>
      </div>

      <h4 class="sub">已生成链接（复制历史）</h4>
      <p v-if="loadingIntakeLinks" class="muted">加载中…</p>
      <div v-if="!loadingIntakeLinks" class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr><th>机构</th><th>状态</th><th>复制次数</th><th>最近复制</th><th>创建于</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="it in intakeLinks" :key="it.id" :class="{ expired: it.expired }">
              <td>
                <div class="agency">{{ it.agencyName }}</div>
                <div class="token muted">…{{ it.token.slice(-8) }}</div>
              </td>
              <td>
                <span v-if="it.expired" class="badge bad">已过期</span>
                <span v-else class="badge ok">有效 · 剩 {{ daysLeft(it.expiresAt) }} 天</span>
              </td>
              <td>{{ it.copies }} 次</td>
              <td>{{ fmt(it.lastCopiedAt) }}</td>
              <td>{{ fmt(it.createdAt) }}</td>
              <td class="ops">
                <button class="btn ghost sm" type="button" :disabled="it.expired" @click="copyRow(it)">
                  {{ copiedToken === it.token ? '已复制 ✓' : '复制链接' }}
                </button>
              </td>
            </tr>
            <tr v-if="!intakeLinks.length"><td colspan="6" class="muted">暂无已生成链接</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.muted { color: var(--muted); font-size: 13px; }
.section-title { margin: 0 0 4px; font-size: 20px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.sub { margin: 16px 0 4px; font-size: 14px; }
.tbl { width: 100%; border-collapse: collapse; margin-top: 8px; }
.tbl th, .tbl td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; font-size: 13px; vertical-align: middle; }
.tbl th { background: var(--bg); color: var(--muted); }
.tbl tr.expired { opacity: 0.55; }
.ops { display: flex; gap: 6px; }
.agency { font-weight: 600; }
.token { font-size: 11px; font-family: ui-monospace, monospace; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
.badge.ok { background: rgba(34,197,94,0.15); color: #16a34a; }
.badge.bad { background: rgba(239,68,68,0.15); color: #dc2626; }
.row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
.row label { color: var(--muted); width: 72px; flex: none; font-size: 13px; }
.input { flex: 1; padding: 9px 10px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); font-size: 14px; }
.btn-primary { background: var(--brand); color: #fff; border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; cursor: pointer; }
.btn-primary.sm { padding: 7px 12px; font-size: 13px; }
.btn-primary:disabled { opacity: 0.6; }
.btn { border: 1px solid var(--line-strong); background: var(--surface); border-radius: 10px; padding: 9px 12px; cursor: pointer; font-size: 14px; }
.btn.ghost { background: transparent; color: var(--brand); border-color: var(--brand); }
.btn.ghost.sm { padding: 7px 10px; font-size: 13px; }
.btn.ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.err { color: var(--danger); margin-top: 10px; }
.link-box { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
.link-box .input { font-size: 12px; color: var(--muted); }
</style>
