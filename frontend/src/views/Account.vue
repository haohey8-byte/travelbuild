<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { fetchMembers, createInvite, listInvites, fetchAgencies, createAgency } from '@/api/auth'
import { listCostInquiries } from '@/api/routes'
import { roleLabel, inviteH5Url, costInquiryH5Url, copyText } from '@/utils/share'
import type { Role, User, Invite, CostInquiry, Agency } from '@/types'

const auth = useAuthStore()
const { user, currentRole } = storeToRefs(auth)

const roles: { key: Role; label: string }[] = [
  { key: 'pandaking', label: '一手 PandaKing' },
  { key: 'agency', label: '境外旅行社' },
  { key: 'provincial', label: '省地接社' },
]
const ROLE_LABEL: Record<Role, string> = {
  pandaking: '一手 PandaKing',
  agency: '境外旅行社',
  provincial: '省地接社',
}
const busy = ref(false)
const err = ref('')

const members = ref<User[]>([])
const loadingMembers = ref(false)

// —— 两层级邀请 ——
const canInviteAdmin = computed(() => user.value?.role === 'pandaking')
const canInviteStaff = computed(
  () =>
    user.value?.level === 'admin' &&
    (user.value?.role === 'agency' || user.value?.role === 'provincial'),
)
const invRole = ref<'agency' | 'provincial'>('agency')
const invAgencyId = ref('')
const invEmail = ref('')
const inviteLink = ref('')
const inviting = ref(false)
const inviteErr = ref('')
const copied = ref(false)

const invites = ref<Invite[]>([])
const loadingInvites = ref(false)

// —— 省地接社：我的成本询价 ——
const myInquiries = ref<CostInquiry[]>([])
const loadingInquiries = ref(false)

// —— 机构管理 ——
const agencies = ref<Agency[]>([])
const loadingAgencies = ref(false)
const showCreateAgency = ref(false)
const newAgency = ref({ id: '', name: '', role: 'agency' as Role, contact: '' })
const agencyErr = ref('')
const agencySaving = ref(false)

async function loadAgencies() {
  if (!auth.token) return
  loadingAgencies.value = true
  try {
    agencies.value = await fetchAgencies()
  } catch {
    agencies.value = []
  } finally {
    loadingAgencies.value = false
  }
}

async function onCreateAgency() {
  agencyErr.value = ''
  if (!newAgency.value.id.trim() || !newAgency.value.name.trim()) {
    agencyErr.value = '机构编号和名称必填'
    return
  }
  agencySaving.value = true
  try {
    const created = await createAgency({
      id: newAgency.value.id.trim(),
      name: newAgency.value.name.trim(),
      role: newAgency.value.role,
      contact: newAgency.value.contact.trim() || undefined,
    })
    agencies.value.push(created)
    showCreateAgency.value = false
    newAgency.value = { id: '', name: '', role: 'agency', contact: '' }
    // 如果正在邀请，自动选上新机构
    if (!invAgencyId.value) invAgencyId.value = created.id
  } catch (e: any) {
    agencyErr.value = e?.response?.data?.message || '创建机构失败'
  } finally {
    agencySaving.value = false
  }
}
async function loadMyInquiries() {
  if (user.value?.role !== 'provincial') return
  loadingInquiries.value = true
  try {
    myInquiries.value = await listCostInquiries()
  } catch {
    myInquiries.value = []
  } finally {
    loadingInquiries.value = false
  }
}

async function onDevLogin(role: Role) {
  err.value = ''
  busy.value = true
  try {
    await auth.loginAsRole(role)
    await loadMembers()
    await loadInvites()
  } catch (e: any) {
    err.value = e?.response?.data?.message || '登录失败（请确认后端已连库并 seed）'
  } finally {
    busy.value = false
  }
}

async function loadMembers() {
  if (!auth.token) return
  loadingMembers.value = true
  try {
    members.value = await fetchMembers()
  } catch {
    /* 忽略 */
  } finally {
    loadingMembers.value = false
  }
}

async function loadInvites() {
  if (!auth.token || !canInviteAdmin.value) return
  loadingInvites.value = true
  try {
    invites.value = await listInvites()
  } catch {
    /* 忽略 */
  } finally {
    loadingInvites.value = false
  }
}

// 生成邀请链接（复制后粘贴到微信群）
async function onGenerateInvite() {
  inviteErr.value = ''
  copied.value = false
  inviting.value = true
  try {
    let body: { role: Role; agencyId?: string; level: 'admin' | 'staff'; email?: string }
    if (canInviteAdmin.value) {
      if (!invAgencyId.value.trim()) {
        inviteErr.value = '请填写机构编号（机构唯一标识）'
        return
      }
      body = {
        role: invRole.value,
        agencyId: invAgencyId.value.trim(),
        level: 'admin',
        email: invEmail.value.trim() || undefined,
      }
    } else if (canInviteStaff.value) {
      if (!user.value?.agencyId) {
        inviteErr.value = '当前账号未绑定机构，无法邀请员工'
        return
      }
      body = {
        role: user.value!.role,
        agencyId: user.value!.agencyId!,
        level: 'staff',
        email: invEmail.value.trim() || undefined,
      }
    } else {
      inviteErr.value = '当前角色无权发起邀请'
      return
    }
    const inv = await createInvite(body)
    inviteLink.value = inviteH5Url(inv.token)
  } catch (e: any) {
    inviteErr.value = e?.response?.data?.message || '生成邀请失败'
  } finally {
    inviting.value = false
  }
}

async function copyInviteLink() {
  if (!inviteLink.value) return
  const ok = await copyText(inviteLink.value)
  copied.value = ok
  setTimeout(() => (copied.value = false), 2000)
}

onMounted(() => {
  loadMembers()
  loadInvites()
  loadMyInquiries()
  loadAgencies()
})

// 权限矩阵（只读展示）
const matrix = [
  { field: '客户档案', pandaking: '✓', agency: '✓(自身)', provincial: '✗' },
  { field: '行程草案(规划)', pandaking: '✓', agency: '✓', provincial: '✓(被分配路线)' },
  { field: '成本①(地接成本)', pandaking: '✓', agency: '✗', provincial: '✓(自身)' },
  { field: '成本②(一手利润)', pandaking: '✓', agency: '✗', provincial: '✗' },
  { field: '对旅行社报价', pandaking: '✓', agency: '✓', provincial: '✗' },
  { field: '加价/游客价', pandaking: '✓', agency: '✓', provincial: '✗' },
  { field: '知识库', pandaking: '读写', agency: '读', provincial: '✗' },
  { field: '发布案例/全局账号', pandaking: '✓', agency: '✗', provincial: '✗' },
]
const LEVEL_LABEL: Record<string, string> = { admin: '管理员', staff: '员工' }
</script>

<template>
  <div>
    <h1 class="page-title">账号</h1>

    <div v-if="user" class="card">
      <p class="muted">当前登录</p>
      <div class="kv"><span>名称</span><b>{{ user.name }}</b></div>
      <div class="kv"><span>角色</span><b>{{ ROLE_LABEL[user.role as Role] || user.role }}</b></div>
      <div class="kv" v-if="user.agencyId"><span>机构编号</span><b>{{ user.agencyId }}</b></div>
      <div class="kv" v-if="user.level"><span>层级</span><b>{{ LEVEL_LABEL[user.level] || user.level }}</b></div>
      <button class="btn btn-primary" @click="auth.logout()">退出登录</button>
    </div>

    <div v-else class="card">
      <h3>开发登录</h3>
      <p class="muted">演示环境：选择角色以开发身份登录（dev-login），后端据此返回对应字段级可见性。</p>
      <div class="role-btns">
        <button
          v-for="r in roles"
          :key="r.key"
          class="btn"
          :class="{ 'btn-primary': currentRole === r.key }"
          :disabled="busy"
          @click="onDevLogin(r.key)"
        >{{ r.label }}</button>
      </div>
    </div>

    <div v-if="err" class="err">{{ err }}</div>

    <!-- 两层级邀请：一手邀请机构管理员 / 管理员邀请机构员工 -->
    <div v-if="user && (canInviteAdmin || canInviteStaff)" class="card" style="margin-top: 16px">
      <h3>{{ canInviteAdmin ? '邀请机构管理员' : '邀请机构员工' }}</h3>
      <p class="muted">
        {{
          canInviteAdmin
            ? '生成 H5 邀请链接，复制后粘贴到微信群，受邀者打开即接受并加入对应机构。'
            : '为「本机构」生成员工邀请链接，复制后发给员工（仅限同一机构）。'
        }}
      </p>

      <template v-if="canInviteAdmin">
        <div class="row">
          <label>机构角色</label>
          <select v-model="invRole" class="input">
            <option value="agency">境外旅行社</option>
            <option value="provincial">省地接社</option>
          </select>
        </div>
        <div class="row">
          <label>选择机构</label>
          <select v-model="invAgencyId" class="input" :disabled="loadingAgencies">
            <option value="" disabled>{{ loadingAgencies ? '加载中…' : '请选择机构' }}</option>
            <option v-for="a in agencies.filter(x => x.role === invRole)" :key="a.id" :value="a.id">{{ a.name }} ({{ a.id }})</option>
          </select>
        </div>
        <div class="row" v-if="invAgencyId === '' && agencies.length > 0">
          <button class="btn ghost sm" @click="showCreateAgency = true" type="button">没有该机构？新建机构</button>
        </div>
      </template>
      <template v-else>
        <div class="kv"><span>机构角色</span><b>{{ ROLE_LABEL[user.role as Role] }}</b></div>
        <div class="kv"><span>机构编号</span><b>{{ user.agencyId }}</b></div>
      </template>

      <div class="row">
        <label>邮箱(可选)</label>
        <input v-model="invEmail" class="input" placeholder="受邀者邮箱，留空亦可" />
      </div>

      <button class="btn btn-primary" :disabled="inviting" @click="onGenerateInvite">
        {{ inviting ? '生成中…' : '生成邀请链接' }}
      </button>

      <p v-if="inviteErr" class="err">{{ inviteErr }}</p>

      <div v-if="inviteLink" class="link-box">
        <input :value="inviteLink" class="input" readonly />
        <button class="btn ghost sm" @click="copyInviteLink">{{ copied ? '已复制 ✓' : '复制链接' }}</button>
      </div>
      <p v-if="inviteLink" class="tip">把上面链接发到微信群，受邀者点开即可成为「{{ roleLabel(invRole) }}{{ canInviteAdmin ? '管理员' : '员工' }}」。</p>
    </div>

    <!-- 新建机构弹窗 -->
    <div v-if="showCreateAgency" class="modal-backdrop" @click.self="showCreateAgency = false">
      <div class="modal">
        <form @submit.prevent="onCreateAgency">
          <h3>新建机构</h3>
          <div class="row">
            <label>机构编号</label>
            <input v-model="newAgency.id" class="input" placeholder="如 org-agency-abc" />
          </div>
          <div class="row">
            <label>机构名称</label>
            <input v-model="newAgency.name" class="input" placeholder="环球旅行社" />
          </div>
          <div class="row">
            <label>角色</label>
            <select v-model="newAgency.role" class="input">
              <option value="agency">境外旅行社</option>
              <option value="provincial">省地接社</option>
            </select>
          </div>
          <div class="row">
            <label>联系方式(可选)</label>
            <input v-model="newAgency.contact" class="input" placeholder="邮箱 / 电话" />
          </div>
          <p v-if="agencyErr" class="err">{{ agencyErr }}</p>
          <div class="modal-actions">
            <button type="button" class="btn" @click="showCreateAgency = false">取消</button>
            <button type="submit" class="btn btn-primary" :disabled="agencySaving">{{ agencySaving ? '保存中…' : '保存' }}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- 一手可见的邀请记录 -->
    <div v-if="user && canInviteAdmin" class="card" style="margin-top: 16px">
      <h3>邀请记录</h3>
      <p v-if="loadingInvites">加载中…</p>
      <div v-else class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>角色</th><th>机构</th><th>层级</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="i in invites" :key="i.id">
              <td>{{ ROLE_LABEL[i.role as Role] }}</td>
              <td>{{ i.agencyId || '-' }}</td>
              <td>{{ LEVEL_LABEL[i.level] || i.level }}</td>
              <td>{{ i.accepted ? '已接受' : '待接受' }}</td>
            </tr>
            <tr v-if="!invites.length"><td colspan="4" class="muted">暂无邀请</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="user" class="card" style="margin-top: 16px">
      <h3>成员列表</h3>
      <p v-if="loadingMembers">加载中…</p>
      <div v-else class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>名称</th><th>角色</th><th>层级</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="m in members" :key="m.id">
            <td>{{ m.name }}</td>
            <td>{{ ROLE_LABEL[m.role as Role] || m.role }}</td>
            <td>{{ m.level ? LEVEL_LABEL[m.level] : '-' }}</td>
            <td>{{ m.disabled ? '已停用' : '启用' }}</td>
          </tr>
          <tr v-if="!members.length"><td colspan="4" class="muted">暂无成员</td></tr>
        </tbody>
      </table>
      </div>
      <p class="tip">成员列表按机构物理隔绝：仅可见「本机构」成员，境外旅行社与省地接社互不可见。</p>
    </div>

    <!-- 省地接社：我的成本询价（打开 H5 回填地接成本） -->
    <div v-if="user && user.role === 'provincial'" class="card" style="margin-top: 16px">
      <h3>我的成本询价</h3>
      <p class="muted">一手发来的成本询价会出现在这里，点开 H5 填写地接成本①即可回传。</p>
      <p v-if="loadingInquiries">加载中…</p>
      <div v-else class="tbl-wrap">
        <table class="tbl">
          <thead><tr><th>路线</th><th>状态</th><th>成本①</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="ci in myInquiries" :key="ci.id">
              <td>{{ ci.routeId.slice(0, 8) }}</td>
              <td>{{ ci.status === 'submitted' ? '已回传' : '待回传' }}</td>
              <td>{{ ci.cost1 != null ? '¥' + Number(ci.cost1).toLocaleString() : '-' }}</td>
              <td>
                <a v-if="ci.token" :href="costInquiryH5Url(ci.token)" target="_blank" class="link">打开询价 H5 ↗</a>
                <span v-else class="muted">-</span>
              </td>
            </tr>
            <tr v-if="!myInquiries.length"><td colspan="4" class="muted">暂无询价</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" style="margin-top: 16px">
      <h3>权限矩阵（字段级）</h3>
      <div class="tbl-wrap">
      <table class="tbl matrix">
        <thead><tr><th>字段 / 能力</th><th>一手</th><th>旅行社</th><th>省地接社</th></tr></thead>
        <tbody>
          <tr v-for="row in matrix" :key="row.field">
            <td>{{ row.field }}</td>
            <td>{{ row.pandaking }}</td>
            <td>{{ row.agency }}</td>
            <td>{{ row.provincial }}</td>
          </tr>
        </tbody>
      </table>
      </div>
      <p class="tip">境外旅行社与省地接社在「价格与信息」上完全物理隔绝：互相不知道对方的存在与数据展示。</p>
    </div>
  </div>
</template>

<style scoped>
.muted { color: var(--muted); font-size: 13px; }
.role-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.kv { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--line); }
.kv span { color: var(--muted); width: 60px; flex: none; }
.row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
.row label { color: var(--muted); width: 72px; flex: none; font-size: 13px; }
.input { flex: 1; padding: 9px 10px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); font-size: 14px; }
.btn-primary { background: var(--brand); color: #fff; border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; cursor: pointer; margin-top: 6px; }
.btn-primary:disabled { opacity: 0.6; }
.btn { border: 1px solid var(--line-strong); background: var(--surface); border-radius: 10px; padding: 9px 12px; cursor: pointer; font-size: 14px; }
.btn.ghost { background: transparent; color: var(--brand); border-color: var(--brand); }
.btn.ghost.sm { padding: 7px 10px; font-size: 13px; }
.link-box { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
.link-box .input { font-size: 12px; color: var(--muted); }
.tip { color: var(--muted); font-size: 12px; margin-top: 10px; line-height: 1.5; }
.tbl { width: 100%; border-collapse: collapse; margin-top: 8px; }
.tbl th, .tbl td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; font-size: 13px; }
.tbl th { background: var(--bg); color: var(--muted); }
.matrix td:first-child { color: var(--ink); }
.err { color: var(--danger); margin-top: 12px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
h3 { margin: 0 0 4px; }

.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--card); border-radius: 14px; padding: 24px; width: 90%; max-width: 440px; box-shadow: 0 16px 40px rgba(0,0,0,0.2); max-height: 90vh; overflow: auto; }
.modal h3 { margin: 0 0 16px; font-size: 18px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
</style>
