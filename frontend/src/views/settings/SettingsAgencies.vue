<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { fetchAgencies, updateAgency } from '@/api/auth'
import { copyText } from '@/utils/share'
import type { Agency, AgencyView, Role } from '@/types'

const auth = useAuthStore()

const agencies = ref<Agency[]>([])
const loading = ref(false)
const loadErr = ref('')

// —— 新增旅行社（一并建登录账号，编号由系统自动生成）——
const showCreate = ref(false)
const newAgency = ref({ name: '', role: 'agency' as Role, contact: '', phone: '', initPwd: '' })
const agencyErr = ref('')
const agencySaving = ref(false)

// 创建成功：一次性展示初始密码
const createdView = ref<AgencyView | null>(null)
const copiedPwd = ref(false)

// —— 删除旅行社（前置校验）——
const deleteTarget = ref<Agency | null>(null)
const deleteErr = ref('')
const deleting = ref(false)

// —— 修改旅行社（名称 / 联系方式；角色结构性锁定）——
const editTarget = ref<Agency | null>(null)
const editForm = ref({ name: '', contact: '' })
const editErr = ref('')
const editSaving = ref(false)

// —— 禁用 / 启用切换（仅从下拉框移除，不阻断登录）——
const togglingId = ref('')

const ROLE_LABEL: Record<string, string> = { agency: '境外旅行社', provincial: '省地接社' }

// 用后端返回的最新旅行社就地替换本地列表项（避免整表重拉闪烁）
function replaceLocal(updated: Agency) {
  const i = agencies.value.findIndex((a) => a.id === updated.id)
  if (i >= 0) agencies.value[i] = updated
  else agencies.value = [...agencies.value, updated]
}

async function onEdit(a: Agency) {
  editTarget.value = a
  editForm.value = { name: a.name, contact: a.contact || '' }
  editErr.value = ''
}
async function onSaveEdit() {
  if (!editTarget.value) return
  editErr.value = ''
  if (!editForm.value.name.trim()) return (editErr.value = '旅行社名称不能为空')
  editSaving.value = true
  try {
    const updated = await updateAgency(editTarget.value.id, {
      name: editForm.value.name.trim(),
      contact: editForm.value.contact.trim() || undefined,
    })
    replaceLocal(updated)
    editTarget.value = null
  } catch (e: any) {
    editErr.value = e?.response?.data?.message || '保存失败'
  } finally {
    editSaving.value = false
  }
}

async function onToggle(a: Agency) {
  if (togglingId.value) return
  togglingId.value = a.id
  try {
    const updated = await updateAgency(a.id, { disabled: !a.disabled })
    replaceLocal(updated)
  } catch (e: any) {
    loadErr.value = e?.response?.data?.message || '切换启用/禁用失败'
  } finally {
    togglingId.value = ''
  }
}

async function load() {
  loading.value = true
  loadErr.value = ''
  try {
    agencies.value = await fetchAgencies()
  } catch (e: any) {
    agencies.value = []
    loadErr.value = `加载旅行社失败：${e?.response?.status || ''} ${e?.response?.data?.message || e?.message || '未知错误'}（token 前缀=${(localStorage.getItem('token') || '').slice(0, 12)}…）`
  } finally {
    loading.value = false
  }
}

async function onCreate() {
  agencyErr.value = ''
  if (!newAgency.value.name.trim()) return (agencyErr.value = '旅行社名称必填')
  if (!/^1[3-9]\d{9}$/.test(newAgency.value.phone.trim())) return (agencyErr.value = '登录手机号格式错误（11 位）')
  if (newAgency.value.initPwd && newAgency.value.initPwd.length < 8) return (agencyErr.value = '初始密码至少 8 位（留空则由系统生成）')
  agencySaving.value = true
  try {
    const view = await auth.createAgency({
      name: newAgency.value.name.trim(),
      role: newAgency.value.role,
      contact: newAgency.value.contact.trim() || undefined,
      phone: newAgency.value.phone.trim(),
      initPwd: newAgency.value.initPwd.trim() || undefined,
    })
    showCreate.value = false
    newAgency.value = { name: '', role: 'agency', contact: '', phone: '', initPwd: '' }
    createdView.value = view
    await load()
  } catch (e: any) {
    agencyErr.value = e?.response?.data?.message || '创建机构失败'
  } finally {
    agencySaving.value = false
  }
}

async function copyPwd() {
  if (!createdView.value?.initPwd) return
  copiedPwd.value = await copyText(createdView.value.initPwd)
  setTimeout(() => (copiedPwd.value = false), 2000)
}

async function confirmDelete() {
  if (!deleteTarget.value) return
  deleteErr.value = ''
  deleting.value = true
  try {
    await auth.deleteAgency(deleteTarget.value.id)
    deleteTarget.value = null
    await load()
  } catch (e: any) {
    const code = e?.response?.data?.code
    if (code === 'AGENCY_HAS_ACTIVE_ROUTES') deleteErr.value = '该机构仍有进行中路线，暂不能删除'
    else if (code === 'AGENCY_HAS_ACTIVE_LINK') deleteErr.value = '该机构仍有未过期提交链接，暂不能删除'
    else deleteErr.value = e?.response?.data?.message || '删除失败'
  } finally {
    deleting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div class="head">
      <h2 class="section-title">旅行社管理</h2>
      <button class="btn btn-primary sm" @click="showCreate = true" type="button">+ 新增旅行社</button>
    </div>
    <p class="muted">创建旅行社将一并生成该旅行社的控制台登录账号（手机号 + 初始密码，首次登录强制改密）。编号由系统按角色自动生成，无需手填。删除需先清空其进行中路线与提交链接。</p>

    <p v-if="loading">加载中…</p>
    <p v-else-if="loadErr" class="err">⚠ {{ loadErr }}</p>
    <div v-else class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>旅行社编号</th><th>名称</th><th>角色</th><th>联系方式</th><th>状态</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="a in agencies" :key="a.id">
            <td>{{ a.id }}</td>
            <td>{{ a.name }}</td>
            <td>{{ ROLE_LABEL[a.role] || a.role }}</td>
            <td>{{ a.contact || '-' }}</td>
            <td>
              <span class="badge" :class="a.disabled ? 'badge-off' : 'badge-on'">
                {{ a.disabled ? '已禁用' : '启用中' }}
              </span>
            </td>
            <td class="ops">
              <button class="btn ghost sm" type="button" @click="onEdit(a)">修改</button>
              <button class="btn ghost sm" type="button" :disabled="togglingId === a.id" @click="onToggle(a)">
                {{ togglingId === a.id ? '处理中…' : a.disabled ? '启用' : '禁用' }}
              </button>
              <button class="btn ghost sm danger" type="button" @click="deleteTarget = a; deleteErr = ''">删除</button>
            </td>
          </tr>
          <tr v-if="!agencies.length"><td colspan="6" class="muted">暂无旅行社</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 新增旅行社弹窗 -->
    <div v-if="showCreate" class="modal-backdrop" @click.self="showCreate = false">
      <div class="modal">
        <h3>新增旅行社</h3>
        <div class="row"><label>旅行社名称</label><input v-model="newAgency.name" class="input" placeholder="环球旅行社" /></div>
        <div class="row"><label>角色</label>
          <select v-model="newAgency.role" class="input">
            <option value="agency">境外旅行社</option>
            <option value="provincial">省地接社</option>
          </select>
        </div>
        <div class="row"><label>联系方式</label><input v-model="newAgency.contact" class="input" placeholder="邮箱 / 电话（可选）" /></div>
        <div class="row"><label>登录手机</label><input v-model="newAgency.phone" class="input" maxlength="11" placeholder="旅行社账号登录手机号" /></div>
        <div class="row"><label>初始密码</label><input v-model="newAgency.initPwd" class="input" type="password" placeholder="留空则系统生成强密码" /></div>
        <p v-if="agencyErr" class="err">{{ agencyErr }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="showCreate = false">取消</button>
          <button class="btn btn-primary" :disabled="agencySaving" type="button" @click="onCreate">
            {{ agencySaving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 创建成功：一次性初始密码 -->
    <div v-if="createdView" class="modal-backdrop" @click.self="createdView = null">
      <div class="modal">
        <h3>旅行社已创建</h3>
        <p class="muted">
          已为「{{ createdView.agency.name }}」生成控制台登录账号（{{ createdView.user.phone }}）。
          旅行社编号：<b>{{ createdView.agency.id }}</b>（系统自动生成，请留存以备对接）。
          以下初始密码<b>仅展示一次</b>，请妥善转发给协作方，其首次登录需修改密码。
        </p>
        <div class="pwd-box">
          <input :value="createdView.initPwd" class="input" readonly />
          <button class="btn ghost sm" @click="copyPwd" type="button">{{ copiedPwd ? '已复制 ✓' : '复制' }}</button>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary" type="button" @click="createdView = null">我知道了</button>
        </div>
      </div>
    </div>

    <!-- 修改旅行社：名称 / 联系方式（角色结构性锁定，不可改） -->
    <div v-if="editTarget" class="modal-backdrop" @click.self="editTarget = null">
      <div class="modal">
        <h3>修改旅行社「{{ editTarget.name }}」</h3>
        <div class="row"><label>旅行社编号</label><input :value="editTarget.id" class="input" disabled /></div>
        <div class="row"><label>角色</label><input :value="ROLE_LABEL[editTarget.role] || editTarget.role" class="input" disabled /></div>
        <div class="row"><label>名称</label><input v-model="editForm.name" class="input" placeholder="旅行社名称" /></div>
        <div class="row"><label>联系方式</label><input v-model="editForm.contact" class="input" placeholder="邮箱 / 电话（可选）" /></div>
        <p class="muted">角色为结构性字段（决定编号前缀语义），此处锁定不可修改。</p>
        <p v-if="editErr" class="err">{{ editErr }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="editTarget = null">取消</button>
          <button class="btn btn-primary" :disabled="editSaving" type="button" @click="onSaveEdit">
            {{ editSaving ? '保存中…' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 删除确认 -->
    <div v-if="deleteTarget" class="modal-backdrop" @click.self="deleteTarget = null">
      <div class="modal">
        <h3>删除旅行社「{{ deleteTarget.name }}」？</h3>
        <p class="muted">删除将一并清除该旅行社的登录账号与过期提交链接；关联路线的归属置空（数据不丢）。需先清空进行中路线与未过期提交链接。</p>
        <p v-if="deleteErr" class="err">{{ deleteErr }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="deleteTarget = null">取消</button>
          <button class="btn btn-primary danger" :disabled="deleting" type="button" @click="confirmDelete">
            {{ deleting ? '删除中…' : '确认删除' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; align-items: center; justify-content: space-between; }
.section-title { margin: 0 0 4px; font-size: 20px; }
.muted { color: var(--muted); font-size: 13px; }
.tbl-wrap { margin-top: 12px; }
.tbl { width: 100%; border-collapse: collapse; background: var(--card); border-radius: 12px; overflow: hidden; }
.tbl th, .tbl td { padding: 10px 14px; border-bottom: 1px solid var(--line); text-align: left; font-size: 13px; }
.tbl th { background: var(--bg); color: var(--muted); }
.ops { display: flex; gap: 6px; }
.badge { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: 12px; font-weight: 600; line-height: 1.6; }
.badge-on { background: color-mix(in srgb, var(--brand) 16%, transparent); color: var(--brand); }
.badge-off { background: var(--line); color: var(--muted); }
.row { display: flex; align-items: center; gap: 10px; margin: 8px 0; }
.row label { color: var(--muted); width: 72px; flex: none; font-size: 13px; }
.input { flex: 1; padding: 9px 10px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); font-size: 14px; }
.btn-primary { background: var(--brand); color: #fff; border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; cursor: pointer; }
.btn-primary.sm { padding: 7px 12px; font-size: 13px; }
.btn-primary:disabled { opacity: 0.6; }
.btn:not(.btn-primary) { border: 1px solid var(--line-strong); background: var(--surface); border-radius: 10px; padding: 9px 12px; cursor: pointer; font-size: 14px; }
.btn.ghost { background: transparent; color: var(--brand); border-color: var(--brand); }
.btn.ghost.sm { padding: 7px 10px; font-size: 13px; }
.btn.ghost.danger, .btn-primary.danger { color: #fff; background: var(--danger); border-color: var(--danger); }
.err { color: var(--danger); margin-top: 10px; }
.pwd-box { display: flex; gap: 8px; margin-top: 10px; align-items: center; }
.pwd-box .input { font-family: ui-monospace, monospace; letter-spacing: 1px; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { background: var(--card); border-radius: 14px; padding: 24px; width: 90%; max-width: 460px; box-shadow: 0 16px 40px rgba(0,0,0,0.2); }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
</style>
