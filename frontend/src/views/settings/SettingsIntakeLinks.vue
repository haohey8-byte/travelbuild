<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchAgencies } from '@/api/auth'
import {
  createIntakeLink,
  listIntakeLinks,
  copyIntakeLink,
  updateIntakeLink,
  deleteIntakeLink,
} from '@/api/routes'
import { copyText } from '@/utils/share'
import type { Agency, IntakeLinkView, IntakeLinkOpts } from '@/types'

const auth = useAuthStore()
const isAgency = auth.currentRole === 'agency'

const agencies = ref<Agency[]>([])
const loadingAgencies = ref(false)
const intakeAgencyId = ref('')
const issueLink = ref('')
const issueErr = ref('')
const issuing = ref(false)
const issueCopied = ref(false)

// 有效期选项：30天 / 1年 / 自定义 / 永久
type ValidityMode = '30d' | '1y' | 'custom' | 'permanent'
const issueMode = ref<ValidityMode>('30d')
const issueCustomDate = ref('')
const issueNote = ref('')

const intakeLinks = ref<IntakeLinkView[]>([])
const loadingIntakeLinks = ref(false)
const copiedToken = ref('')

// 编辑弹窗
const editing = ref<IntakeLinkView | null>(null)
const editMode = ref<ValidityMode>('30d')
const editCustomDate = ref('')
const editNote = ref('')
const savingEdit = ref(false)
const editErr = ref('')

const today = new Date().toISOString().slice(0, 10)

const agencyOptions = computed(() => agencies.value.filter((a) => a.role === 'agency' && !a.disabled))

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
function validityText(it: IntakeLinkView) {
  if (it.permanent) return '永久有效'
  if (!it.expiresAt) return '—'
  if (it.expired) return '已过期'
  return `剩 ${daysLeft(it.expiresAt)} 天`
}

function buildOpts(mode: ValidityMode, customDate: string, note: string): IntakeLinkOpts {
  const noteVal = note?.trim() || undefined
  if (mode === 'permanent') return { permanent: true, note: noteVal }
  if (mode === '30d') return { expiresInDays: 30, note: noteVal }
  if (mode === '1y') return { expiresInDays: 365, note: noteVal }
  // custom
  return { customExpiresAt: customDate ? new Date(customDate).toISOString() : undefined, note: noteVal }
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
    const opts = buildOpts(issueMode.value, issueCustomDate.value, issueNote.value)
    const res = await createIntakeLink(intakeAgencyId.value, opts)
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

function openEdit(it: IntakeLinkView) {
  editing.value = it
  editErr.value = ''
  if (it.permanent) {
    editMode.value = 'permanent'
    editCustomDate.value = ''
  } else if (it.expiresAt) {
    editMode.value = 'custom'
    editCustomDate.value = it.expiresAt.slice(0, 10)
  } else {
    editMode.value = '30d'
    editCustomDate.value = ''
  }
  editNote.value = it.note || ''
}
async function saveEdit() {
  if (!editing.value) return
  editErr.value = ''
  savingEdit.value = true
  try {
    const opts = buildOpts(editMode.value, editCustomDate.value, editNote.value)
    await updateIntakeLink(editing.value.token, opts)
    editing.value = null
    await loadIntakeLinks()
  } catch (e: any) {
    editErr.value = e?.response?.data?.message || '保存失败'
  } finally {
    savingEdit.value = false
  }
}
async function revoke(it: IntakeLinkView) {
  if (!confirm(`确认撤销「${it.agencyName}」的提交链接？撤销后该链接立即失效。`)) return
  try {
    await deleteIntakeLink(it.token)
    await loadIntakeLinks()
  } catch (e: any) {
    alert(e?.response?.data?.message || '撤销失败')
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
      {{
        isAgency
          ? '为本机构预发一条常驻提交链接，对方凭链接免登录提交路线初稿；可设为永久有效或自定义有效期，可随时编辑或撤销。'
          : '为某家境外旅行社预发一条常驻提交链接，对方凭链接免登录提交路线初稿；可设为永久有效或自定义有效期（游客常提前一年咨询），可重复生成替换、随时编辑或撤销。'
      }}
    </p>

    <div class="card">
      <div class="row">
        <label>选择机构</label>
        <select v-model="intakeAgencyId" class="input" :disabled="loadingAgencies || isAgency">
          <option value="">请选择境外旅行社</option>
          <option v-for="a in agencyOptions" :key="a.id" :value="a.id">{{ a.name }} ({{ a.id }})</option>
        </select>
      </div>

      <div class="row">
        <label>有效期</label>
        <select v-model="issueMode" class="input">
          <option value="30d">30 天</option>
          <option value="1y">1 年</option>
          <option value="custom">自定义日期</option>
          <option value="permanent">永久有效</option>
        </select>
        <input
          v-if="issueMode === 'custom'"
          type="date"
          class="input"
          v-model="issueCustomDate"
          :min="today"
          style="max-width: 180px"
        />
      </div>

      <div class="row">
        <label>备注</label>
        <input
          v-model="issueNote"
          class="input"
          type="text"
          maxlength="120"
          placeholder="如机构联系人 / 用途说明（选填）"
        />
      </div>

      <div class="row end">
        <button class="btn btn-primary sm" :disabled="issuing" @click="onIssueIntake" type="button">
          {{ issuing ? '生成中…' : '预发链接' }}
        </button>
      </div>

      <p v-if="issueErr" class="err">{{ issueErr }}</p>
      <div v-if="issueLink" class="link-box">
        <input :value="issueLink" class="input" readonly />
        <button class="btn ghost sm" @click="copyIssue" type="button">{{ issueCopied ? '已复制 ✓' : '复制链接' }}</button>
      </div>

      <h4 class="sub">已生成链接</h4>
      <p v-if="loadingIntakeLinks" class="muted">加载中…</p>
      <div v-if="!loadingIntakeLinks" class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>机构</th>
              <th>有效期</th>
              <th>备注</th>
              <th>复制次数</th>
              <th>最近复制</th>
              <th>创建于</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="it in intakeLinks" :key="it.id" :class="{ expired: it.expired }">
              <td>
                <div class="agency">{{ it.agencyName }}</div>
                <div class="token muted">…{{ it.token.slice(-8) }}</div>
              </td>
              <td>
                <span v-if="it.permanent" class="badge perm">永久有效</span>
                <span v-else-if="it.expired" class="badge bad">已过期</span>
                <span v-else class="badge ok">剩 {{ daysLeft(it.expiresAt!) }} 天</span>
              </td>
              <td class="note">{{ it.note || '—' }}</td>
              <td>{{ it.copies }} 次</td>
              <td>{{ fmt(it.lastCopiedAt) }}</td>
              <td>{{ fmt(it.createdAt) }}</td>
              <td class="ops">
                <button class="btn ghost sm" type="button" :disabled="it.expired" @click="copyRow(it)">
                  {{ copiedToken === it.token ? '已复制 ✓' : '复制' }}
                </button>
                <button class="btn ghost sm" type="button" @click="openEdit(it)">编辑</button>
                <button class="btn danger sm" type="button" @click="revoke(it)">撤销</button>
              </td>
            </tr>
            <tr v-if="!intakeLinks.length"><td colspan="7" class="muted">暂无已生成链接</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="editing" class="overlay" @click.self="editing = null">
      <div class="dialog">
        <h3 class="dlg-title">编辑提交链接</h3>
        <p class="muted">{{ editing.agencyName }} · …{{ editing.token.slice(-8) }}</p>

        <div class="row">
          <label>有效期</label>
          <select v-model="editMode" class="input">
            <option value="30d">30 天</option>
            <option value="1y">1 年</option>
            <option value="custom">自定义日期</option>
            <option value="permanent">永久有效</option>
          </select>
          <input
            v-if="editMode === 'custom'"
            type="date"
            class="input"
            v-model="editCustomDate"
            :min="today"
            style="max-width: 180px"
          />
        </div>

        <div class="row">
          <label>备注</label>
          <input
            v-model="editNote"
            class="input"
            type="text"
            maxlength="120"
            placeholder="如机构联系人 / 用途说明（选填）"
          />
        </div>

        <p v-if="editErr" class="err">{{ editErr }}</p>

        <div class="row end">
          <button class="btn ghost sm" type="button" @click="editing = null">取消</button>
          <button class="btn btn-primary sm" type="button" :disabled="savingEdit" @click="saveEdit">
            {{ savingEdit ? '保存中…' : '保存' }}
          </button>
        </div>
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
.ops { display: flex; gap: 6px; white-space: nowrap; }
.note { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.agency { font-weight: 600; }
.token { font-size: 11px; font-family: ui-monospace, monospace; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
.badge.ok { background: rgba(34,197,94,0.15); color: #16a34a; }
.badge.bad { background: rgba(239,68,68,0.15); color: #dc2626; }
.badge.perm { background: rgba(59,130,246,0.15); color: #2563eb; }
.row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
.row label { color: var(--muted); width: 72px; flex: none; font-size: 13px; }
.row.end { justify-content: flex-end; }
.input { flex: 1; padding: 9px 10px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); font-size: 14px; }
.btn-primary { background: var(--brand); color: #fff; border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; cursor: pointer; }
.btn-primary.sm { padding: 7px 12px; font-size: 13px; }
.btn-primary:disabled { opacity: 0.6; }
.btn:not(.btn-primary) { border: 1px solid var(--line-strong); background: var(--surface); border-radius: 10px; padding: 9px 12px; cursor: pointer; font-size: 14px; }
.btn.ghost { background: transparent; color: var(--brand); border-color: var(--brand); }
.btn.ghost.sm { padding: 7px 10px; font-size: 13px; }
.btn.ghost:disabled { opacity: 0.5; cursor: not-allowed; }
.btn.danger { background: transparent; color: #dc2626; border-color: #dc2626; }
.btn.danger.sm { padding: 7px 10px; font-size: 13px; }
.err { color: var(--danger); margin-top: 10px; }
.link-box { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
.link-box .input { font-size: 12px; color: var(--muted); }

/* 编辑弹窗 */
.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
.dialog { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 20px; width: 100%; max-width: 460px; box-shadow: 0 20px 60px rgba(0,0,0,0.25); }
.dlg-title { margin: 0 0 2px; font-size: 17px; }
</style>
