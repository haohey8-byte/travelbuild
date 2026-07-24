<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchAgencies } from '@/api/auth'
import {
  createIntakeLink,
  listIntakeLinks,
  copyIntakeLink,
  deleteIntakeLink,
} from '@/api/routes'
import { copyText } from '@/utils/share'
import type { Agency, IntakeLinkView, IntakeLinkOpts } from '@/types'

const auth = useAuthStore()
const isAgency = auth.currentRole === 'agency'

const agencies = ref<Agency[]>([])
const loadingAgencies = ref(false)
const intakeAgencyId = ref('')
const issueErr = ref('')
const issuing = ref(false)
const issueNote = ref('')
const issueSuccess = ref('')  // 最近一次生成的提示（成功 → 显示在表单下，2 秒后淡出）

// 有效期选项：30天 / 1年 / 自定义 / 永久（默认永久——游客常提前一年咨询）
type ValidityMode = '30d' | '1y' | 'custom' | 'permanent'
const issueMode = ref<ValidityMode>('permanent')
const issueCustomDate = ref('')

const intakeLinks = ref<IntakeLinkView[]>([])
const loadingIntakeLinks = ref(false)
const listErr = ref('')
const copiedToken = ref('')

// 「复制给旅行社」成功后的友好引导弹窗：告诉用户下一步去微信粘贴给合作旅行社
const showCopiedDialog = ref(false)
const copiedDialogUrl = ref('')
const copiedDialogAgency = ref('')

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
  listErr.value = ''
  try {
    intakeLinks.value = await listIntakeLinks()
  } catch (e: any) {
    intakeLinks.value = []
    listErr.value = e?.response?.data?.message || '加载已生成链接失败'
  } finally {
    loadingIntakeLinks.value = false
  }
}

async function onIssueIntake() {
  issueErr.value = ''
  issueSuccess.value = ''
  if (!intakeAgencyId.value) return (issueErr.value = '请选择机构')
  issuing.value = true
  try {
    const opts = buildOpts(issueMode.value, issueCustomDate.value, issueNote.value)
    const res = await createIntakeLink(intakeAgencyId.value, opts)
    issueSuccess.value = `已生成新链接（…${res.token.slice(-8)}），下方清单已更新`
    setTimeout(() => (issueSuccess.value = ''), 3000)
    await loadIntakeLinks()
  } catch (e: any) {
    issueErr.value = e?.response?.data?.message || '新增提交链接失败'
  } finally {
    issuing.value = false
  }
}

async function copyToAgency(item: IntakeLinkView) {
  const url = fullLink(item.link)
  const ok = await copyText(url)
  if (!ok) {
    // 剪贴板不可用（如微信非安全上下文）→ 仍弹出友好提示，引导用户长按手动复制
    copiedDialogUrl.value = url
    copiedDialogAgency.value = item.agencyName
    showCopiedDialog.value = true
    return
  }
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
  // 复制成功 → 弹出友好引导，告诉用户下一步去微信粘贴给合作旅行社
  copiedDialogUrl.value = url
  copiedDialogAgency.value = item.agencyName
  showCopiedDialog.value = true
}

// 弹窗内「再复制一次」：纯复制，不重复计数
async function copyAgain() {
  await copyText(copiedDialogUrl.value)
}

function closeCopiedDialog() {
  showCopiedDialog.value = false
}

async function deleteLink(item: IntakeLinkView) {
  if (!confirm(`确认删除「${item.agencyName}」的提交链接？删除后该链接立即失效。`)) return
  try {
    await deleteIntakeLink(item.token)
    // 乐观更新：立即从本地列表剔除，再异步刷一遍同步服务端状态
    intakeLinks.value = intakeLinks.value.filter((x) => x.token !== item.token)
    await loadIntakeLinks()
  } catch (e: any) {
    alert(e?.response?.data?.message || '删除失败')
  }
}

onMounted(() => {
  loadAgencies()
  loadIntakeLinks()
})
</script>

<template>
  <div>
    <h2 class="section-title">旅行社免登录路线提交链接（route-intake）</h2>
    <p class="muted">
      {{
        isAgency
          ? '为本机构预发一条常驻提交链接，对方凭链接免登录提交路线初稿；可设为永久有效或自定义有效期，可随时复制给旅行社或删除。'
          : '为某家境外旅行社预发一条常驻提交链接，对方凭链接免登录提交路线初稿；可设为永久有效或自定义有效期（游客常提前一年咨询），可重复生成替换、可随时复制给旅行社或删除。'
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
          {{ issuing ? '生成中…' : '新增旅行社路线提交URL链接' }}
        </button>
      </div>

      <p v-if="issueErr" class="err">{{ issueErr }}</p>
      <p v-if="issueSuccess" class="ok">{{ issueSuccess }}</p>

      <h4 class="sub">已生成链接</h4>
      <p v-if="loadingIntakeLinks" class="muted">加载中…</p>
      <p v-else-if="listErr" class="err">{{ listErr }}</p>
      <div v-else class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr>
              <th>机构</th>
              <th>有效期</th>
              <th>备注</th>
              <th>提交链接</th>
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
              <td class="url">
                <code class="url-box" :title="fullLink(it.link)">{{ fullLink(it.link) }}</code>
              </td>
              <td>{{ it.copies }} 次</td>
              <td>{{ fmt(it.lastCopiedAt) }}</td>
              <td>{{ fmt(it.createdAt) }}</td>
              <td class="ops">
                <button class="btn ghost sm" type="button" :disabled="it.expired" @click="copyToAgency(it)">
                  {{ copiedToken === it.token ? '已复制 ✓' : '复制给旅行社' }}
                </button>
                <button class="btn danger sm" type="button" @click="deleteLink(it)">删除</button>
              </td>
            </tr>
            <tr v-if="!intakeLinks.length"><td colspan="8" class="muted">暂无已生成链接</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 复制成功友好引导：告诉用户下一步去微信粘贴给合作旅行社 -->
    <transition name="fade">
      <div v-if="showCopiedDialog" class="modal-backdrop" @click.self="closeCopiedDialog">
        <div class="modal copy-modal" role="dialog" aria-modal="true" aria-labelledby="copyDlgTitle">
          <div class="copy-modal-icon">✓</div>
          <h2 id="copyDlgTitle" class="copy-modal-title">链接已复制成功</h2>
          <p class="copy-modal-sub">
            已为「{{ copiedDialogAgency }}」复制免登录提交链接，下一步请把链接粘贴到微信，发给对应的合作旅行社联系人。
          </p>
          <div class="copy-modal-url">
            <code>{{ copiedDialogUrl }}</code>
            <button class="btn ghost sm" type="button" @click="copyAgain">再复制一次</button>
          </div>
          <ol class="copy-modal-steps">
            <li><b>打开微信</b>，进入与该旅行社联系人的聊天窗口</li>
            <li>长按输入框 <b>粘贴</b> 刚才复制的链接并发送</li>
            <li>对方点开链接即可 <b>免登录</b> 提交路线初稿，自动进入协作流程</li>
          </ol>
          <div class="modal-actions">
            <button class="btn btn-primary" type="button" @click="closeCopiedDialog">我知道了</button>
          </div>
        </div>
      </div>
    </transition>
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
.ok { color: #16a34a; margin-top: 10px; }

/* 行内 URL 展示：允许换行并约束宽度，避免撑破表格 */
.tbl td.url { white-space: normal; vertical-align: top; }
.url-box {
  display: block;
  max-width: 320px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
  white-space: normal;
  color: var(--ink);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 7px 9px;
}

/* —— 复制成功友好引导弹窗 —— */
.copy-modal { max-width: 440px; text-align: center; }
.copy-modal-icon {
  width: 48px;
  height: 48px;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: var(--ok-50);
  color: var(--ok);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 700;
}
.copy-modal-title { margin: 0 0 8px; font-size: 18px; font-weight: 700; }
.copy-modal-sub { margin: 0 0 14px; font-size: 13px; line-height: 1.6; color: var(--muted); }
.copy-modal-url {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
  padding: 8px 10px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 10px;
  text-align: left;
}
.copy-modal-url code {
  flex: 1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
  color: var(--ink);
}
.copy-modal-steps {
  margin: 0 0 18px;
  padding-left: 20px;
  text-align: left;
  font-size: 13px;
  line-height: 1.8;
  color: var(--muted);
}
.copy-modal-steps b { color: var(--ink); }
.copy-modal .modal-actions { justify-content: center; }

/* 弹窗淡入淡出（premium 微交互） */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>