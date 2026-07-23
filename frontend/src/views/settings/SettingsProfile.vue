<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { roleLabel } from '@/utils/share'
import type { Role, User } from '@/types'

const auth = useAuthStore()
const user = auth.user as User | null

const LEVEL_LABEL: Record<string, string> = { admin: '管理员', staff: '员工' }

// 字段级权限矩阵（物理隔绝，只读展示）
const matrix = [
  { field: '客户档案', pandaking: '✓', agency: '✓(自身)', provincial: '✗' },
  { field: '行程草案(规划)', pandaking: '✓', agency: '✓', provincial: '✓(被分配路线)' },
  { field: '成本①(地接成本)', pandaking: '✓', agency: '✗', provincial: '✓(自身)' },
  { field: '成本②(PandaKing 利润)', pandaking: '✓', agency: '✗', provincial: '✗' },
  { field: '对旅行社报价', pandaking: '✓', agency: '✓', provincial: '✗' },
  { field: '加价/游客价', pandaking: '✓', agency: '✓', provincial: '✗' },
  { field: '知识库', pandaking: '读写', agency: '读', provincial: '✗' },
  { field: '发布案例/全局账号', pandaking: '✓', agency: '✗', provincial: '✗' },
]
const ROLE_LABEL: Record<Role, string> = {
  pandaking: 'PandaKing',
  agency: '境外旅行社',
  provincial: '省地接社',
}
</script>

<template>
  <div>
    <h2 class="section-title">我的</h2>

    <div v-if="user" class="card">
      <p class="muted">当前登录</p>
      <div class="kv"><span>名称</span><b>{{ user.name }}</b></div>
      <div class="kv"><span>角色</span><b>{{ ROLE_LABEL[user.role] || user.role }}</b></div>
      <div class="kv" v-if="user.agencyId"><span>机构编号</span><b>{{ user.agencyId }}</b></div>
      <div class="kv" v-if="user.level"><span>层级</span><b>{{ LEVEL_LABEL[user.level] || user.level }}</b></div>
      <div class="kv" v-if="user.phone"><span>手机号</span><b>{{ user.phone }}</b></div>
      <button class="btn btn-primary" @click="auth.logout()">退出登录</button>
    </div>

    <div class="card" style="margin-top: 16px">
      <h3>协作说明（物理隔绝）</h3>
      <p class="muted">
        本平台采用<b>物理隔绝</b>设计：一手 PandaKing、境外旅行社、省地接社三方数据互不越权可见。
        境外旅行社与省地接社互相不知道对方的存在与数据；价格与成本信息按角色严格裁剪。
        你看到的「我的路线 / 我的询价」仅包含归属于本机构的数据。
      </p>
    </div>

    <div class="card" style="margin-top: 16px">
      <h3>权限矩阵（字段级）</h3>
      <div class="tbl-wrap">
        <table class="tbl matrix">
          <thead><tr><th>字段 / 能力</th><th>PandaKing</th><th>旅行社</th><th>省地接社</th></tr></thead>
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
.section-title { margin: 0 0 14px; font-size: 20px; }
.muted { color: var(--muted); font-size: 13px; }
.kv { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--line); }
.kv span { color: var(--muted); width: 60px; flex: none; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
h3 { margin: 0 0 4px; }
.tip { color: var(--muted); font-size: 12px; margin-top: 10px; line-height: 1.5; }
.tbl { width: 100%; border-collapse: collapse; margin-top: 8px; }
.tbl th, .tbl td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; font-size: 13px; }
.tbl th { background: var(--bg); color: var(--muted); }
.matrix td:first-child { color: var(--ink); }
.btn-primary { background: var(--brand); color: #fff; border: none; border-radius: 10px; padding: 10px 14px; font-weight: 700; cursor: pointer; margin-top: 6px; }
</style>
