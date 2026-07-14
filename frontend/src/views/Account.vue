<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { fetchMembers } from '@/api/auth'
import type { Role, User } from '@/types'

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

async function onDevLogin(role: Role) {
  err.value = ''
  busy.value = true
  try {
    await auth.loginAsRole(role)
    await loadMembers()
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

onMounted(loadMembers)

// 权限矩阵（只读展示）
const matrix = [
  { field: '客户档案', pandaking: '✓', agency: '✓(自身)', provincial: '✗' },
  { field: '行程草案(旅行社)', pandaking: '✓', agency: '✓', provincial: '✗' },
  { field: '成本①(地接成本)', pandaking: '✓', agency: '✗', provincial: '✓(自身)' },
  { field: '成本②(一手利润)', pandaking: '✓', agency: '✗', provincial: '✗' },
  { field: '对旅行社报价', pandaking: '✓', agency: '✓', provincial: '✗' },
  { field: '加价/游客价', pandaking: '✓', agency: '✓', provincial: '✗' },
  { field: '知识库', pandaking: '读写', agency: '读', provincial: '✗' },
  { field: '发布案例/全局账号', pandaking: '✓', agency: '✗', provincial: '✗' },
]
</script>

<template>
  <div>
    <h1 class="page-title">账号</h1>

    <div v-if="user" class="card">
      <p class="muted">当前登录</p>
      <div class="kv"><span>名称</span><b>{{ user.name }}</b></div>
      <div class="kv"><span>角色</span><b>{{ ROLE_LABEL[user.role as Role] || user.role }}</b></div>
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

    <div v-if="user" class="card" style="margin-top: 16px">
      <h3>成员列表</h3>
      <p v-if="loadingMembers">加载中…</p>
      <div v-else class="tbl-wrap">
      <table class="tbl">
        <thead><tr><th>名称</th><th>角色</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="m in members" :key="m.id">
            <td>{{ m.name }}</td>
            <td>{{ ROLE_LABEL[m.role as Role] || m.role }}</td>
            <td>{{ m.disabled ? '已停用' : '启用' }}</td>
          </tr>
          <tr v-if="!members.length"><td colspan="3" class="muted">暂无成员</td></tr>
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
    </div>
  </div>
</template>

<style scoped>
.muted { color: var(--muted); font-size: 13px; }
.role-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.kv { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--line); }
.kv span { color: var(--muted); width: 60px; }
.tbl { width: 100%; border-collapse: collapse; margin-top: 8px; }
.tbl th, .tbl td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; font-size: 13px; }
.tbl th { background: var(--bg); color: var(--muted); }
.matrix td:first-child { color: var(--ink); }
.err { color: var(--danger); margin-top: 12px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
h3 { margin: 0 0 4px; }
</style>
