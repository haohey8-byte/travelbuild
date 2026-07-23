<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchAgencies } from '@/api/auth'
import { createIntakeLink } from '@/api/routes'
import { copyText } from '@/utils/share'
import type { AdminView, Agency } from '@/types'

const auth = useAuthStore()

const admins = ref<AdminView[]>([])
const loading = ref(false)
const err = ref('')

// —— 新增管理员 ——
const showCreate = ref(false)
const newAdmin = ref({ name: '', phone: '', initPwd: '' })
const createErr = ref('')
const creating = ref(false)

// —— 重置密码 ——
const resetTarget = ref<AdminView | null>(null)
const resetPwd = ref('')
const resetErr = ref('')
const resetting = ref(false)

// —— 禁用确认 ——
const disableTarget = ref<AdminView | null>(null)
const disabling = ref(false)

// —— 机构提交链接（route-intake）——
const agencies = ref<Agency[]>([])
const loadingAgencies = ref(false)
const intakeAgencyId = ref('')
const intakeLink = ref('')
const intakeErr = ref('')
const issuing = ref(false)
const copied = ref(false)

const agencyOptions = computed(() => agencies.value.filter((a) => a.role === 'agency'))

async function loadAdmins() {
  loading.value = true
  err.value = ''
  try {
    admins.value = await auth.fetchAdmins()
  } catch (e: any) {
    err.value = e?.response?.data?.message || '加载管理员失败'
  } finally {
    loading.value = false
  }
}

async function loadAgencies() {
  loadingAgencies.value = true
  try {
    agencies.value = await fetchAgencies()
  } catch {
    agencies.value = []
  } finally {
    loadingAgencies.value = false
  }
}

async function onCreateAdmin() {
  createErr.value = ''
  if (!newAdmin.value.name.trim()) return (createErr.value = '名称必填')
  if (!/^1[3-9]\d{9}$/.test(newAdmin.value.phone.trim())) return (createErr.value = '手机号格式错误')
  if (newAdmin.value.initPwd.length < 8) return (createErr.value = '初始密码至少 8 位')
  creating.value = true
  try {
    await auth.createAdmin({
      name: newAdmin.value.name.trim(),
      phone: newAdmin.value.phone.trim(),
      initPwd: newAdmin.value.initPwd,
    })
    showCreate.value = false
    newAdmin.value = { name: '', phone: '', initPwd: '' }
    await loadAdmins()
  } catch (e: any) {
    createErr.value = e?.response?.data?.message || '创建失败'
  } finally {
    creating.value = false
  }
}

async function onResetPwd() {
  resetErr.value = ''
  if (resetPwd.value.length < 8) return (resetErr.value = '新密码至少 8 位')
  if (!resetTarget.value) return
  resetting.value = true
  try {
    await auth.resetAdminPwd(resetTarget.value.id, resetPwd.value)
    resetTarget.value = null
    resetPwd.value = ''
    await loadAdmins()
  } catch (e: any) {
    resetErr.value = e?.response?.data?.message || '重置失败'
  } finally {
    resetting.value = false
  }
}

async function confirmDisable() {
  if (!disableTarget.value) return
  disabling.value = true
  try {
    await auth.disableAdmin(disableTarget.value.id)
    disableTarget.value = null
    await loadAdmins()
  } catch (e: any) {
    err.value = e?.response?.data?.message || '禁用失败'
    disableTarget.value = null
  } finally {
    disabling.value = false
  }
}

async function onIssueIntake() {
  intakeErr.value = ''
  copied.value = false
  if (!intakeAgencyId.value) return (intakeErr.value = '请选择机构')
  issuing.value = true
  try {
    const res = await createIntakeLink(intakeAgencyId.value)
    const base = import.meta.env.VITE_BASE || '/'
    intakeLink.value = location.origin + base + '#' + res.link
  } catch (e: any) {
    intakeErr.value = e?.response?.data?.message || '预发链接失败'
  } finally {
    issuing.value = false
  }
}

async function copyIntake() {
  if (!intakeLink.value) return
  const ok = await copyText(intakeLink.value)
  copied.value = ok
  setTimeout(() => (copied.value = false), 2000)
}

onMounted(() => {
  loadAdmins()
  loadAgencies()
})
</script>

<template>
  <div>
    <h1 class="page-title">管理员</h1>
    <p class="muted">仅一手 PandaKing 可访问。管理员以手机号 + 密码登录控制台，支持多管理员与首次强制改密。</p>

    <div class="card">
      <div class="card-head">
        <h3>管理员列表</h3>
        <button class="btn btn-primary sm" @click="showCreate = true" type="button">+ 新增管理员</button>
      </div>
      <p v-if="loading">加载中…</p>
      <p v-if="err" class="err">{{ err }}</p>
      <div v-if="!loading" class="tbl-wrap">
        <table class="tbl">
          <thead>
            <tr><th>名称</th><th>手机号</th><th>状态</th><th>首次改密</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="a in admins" :key="a.id">
              <td>{{ a.name }}</td>
              <td>{{ a.phone }}</td>
              <td>{{ a.disabled ? '已禁用' : '启用' }}</td>
              <td>{{ a.mustChangePwd ? '待修改' : '已设置' }}</td>
              <td class="ops">
                <button class="btn ghost sm" type="button" @click="resetTarget = a; resetPwd = ''">重置密码</button>
                <button
                  v-if="!a.disabled"
                  class="btn ghost sm danger"
                  type="button"
                  @click="disableTarget = a"
                >禁用</button>
              </td>
            </tr>
            <tr v-if="!admins.length"><td colspan="5" class="muted">暂无管理员</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 机构提交链接（route-intake）-->
    <div class="card" style="margin-top: 16px">
      <h3>机构提交链接（route-intake）</h3>
      <p class="muted">为某家境外旅行社预发一条常驻提交链接，对方凭链接免登录提交路线初稿；链接 30 天有效，可重复生成替换。</p>
      <div class="row">
        <label>选择机构</label>
        <select v-model="intakeAgencyId" class="input" :disabled="loadingAgencies">
          <option value="">请选择境外旅行社</option>
          <option v-for="a in agencyOptions" :key="a.id" :value="a.id">{{ a.name }} ({{ a.id }})</option>
        </select>
        <button class="btn btn-primary sm" :disabled="issuing" @click="onIssueIntake" type="button">
          {{ issuing ? '生成中…' : '预发链接' }}
        </button>
      </div>
      <p v-if="intakeErr" class="err">{{ intakeErr }}</p>
      <div v-if="intakeLink" class="link-box">
        <input :value="intakeLink" class="input" readonly />
        <button class="btn ghost sm" @click="copyIntake" type="button">{{ copied ? '已复制 ✓' : '复制链接' }}</button>
      </div>
    </div>

    <!-- 新增管理员弹窗 -->
    <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
      <div class="modal">
        <h3>新增管理员</h3>
        <div class="row"><label>名称</label><input v-model="newAdmin.name" class="input" placeholder="如 张三" /></div>
        <div class="row"><label>手机号</label><input v-model="newAdmin.phone" class="input" maxlength="11" placeholder="11 位手机号" /></div>
        <div class="row"><label>初始密码</label><input v-model="newAdmin.initPwd" class="input" type="password" placeholder="至少 8 位" /></div>
        <p v-if="createErr" class="err">{{ createErr }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="showCreate = false">取消</button>
          <button class="btn btn-primary" :disabled="creating" type="button" @click="onCreateAdmin">
            {{ creating ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 重置密码弹窗 -->
    <div v-if="resetTarget" class="modal-backdrop" @click.self="resetTarget = null">
      <div class="modal">
        <h3>重置「{{ resetTarget.name }}」的密码</h3>
        <p class="muted">重置后对方下次登录需使用新密码（首次登录仍会被要求改密）。</p>
        <div class="row"><label>新密码</label><input v-model="resetPwd" class="input" type="password" placeholder="至少 8 位" /></div>
        <p v-if="resetErr" class="err">{{ resetErr }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="resetTarget = null">取消</button>
          <button class="btn btn-primary" :disabled="resetting" type="button" @click="onResetPwd">
            {{ resetting ? '重置中…' : '确认重置' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 禁用确认 -->
    <div v-if="disableTarget" class="modal-backdrop" @click.self="disableTarget = null">
      <div class="modal">
        <h3>禁用「{{ disableTarget.name }}」？</h3>
        <p class="muted">禁用后该管理员无法登录，需重新创建才能恢复（MVP 不提供启用）。请至少保留 1 名启用管理员。</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="disableTarget = null">取消</button>
          <button class="btn btn-primary danger" :disabled="disabling" type="button" @click="confirmDisable">
            {{ disabling ? '禁用中…' : '确认禁用' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.muted { color: var(--muted); font-size: 13px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
h3 { margin: 0 0 4px; }
.tbl { width: 100%; border-collapse: collapse; margin-top: 8px; }
.tbl th, .tbl td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; font-size: 13px; }
.tbl th { background: var(--bg); color: var(--muted); }
.ops { display: flex; gap: 6px; }
.row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
.row label { color: var(--muted); width: 72px; flex: none; font-size: 13px; }
.input { flex: 1; padding: 9px 10px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); font-size: 14px; }
.btn-primary { background: var(--brand); color: #fff; border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; cursor: pointer; }
.btn-primary.sm { padding: 7px 12px; font-size: 13px; }
.btn-primary:disabled { opacity: 0.6; }
.btn { border: 1px solid var(--line-strong); background: var(--surface); border-radius: 10px; padding: 9px 12px; cursor: pointer; font-size: 14px; }
.btn.ghost { background: transparent; color: var(--brand); border-color: var(--brand); }
.btn.ghost.sm { padding: 7px 10px; font-size: 13px; }
.btn.ghost.danger, .btn-primary.danger { color: #fff; background: var(--danger); border-color: var(--danger); }
.err { color: var(--danger); margin-top: 10px; }
.link-box { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
.link-box .input { font-size: 12px; color: var(--muted); }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--card); border-radius: 14px; padding: 24px; width: 90%; max-width: 440px; box-shadow: 0 16px 40px rgba(0,0,0,0.2); }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
</style>
