<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useRouter } from 'vue-router'
import { listIntakeLinks } from '@/api/routes'
import { copyText } from '@/utils/share'
import type { IntakeLinkView, Role, User } from '@/types'

const auth = useAuthStore()
const router = useRouter()
// 退出登录后返回首页（而非由路由守卫重定向到登录页）
function onLogout() {
  auth.logout()
  router.push('/')
}
const user = auth.user as User | null
const role = computed<Role>(() => user?.role || 'pandaking')

const LEVEL_LABEL: Record<string, string> = { admin: '管理员', staff: '员工' }

// —— 权限矩阵：按角色裁剪 ——
// agency：只展示「旅行社」一列；删除「成本①」「成本②」两行；「对旅行社报价」→「报价」
// pandaking / provincial：保留完整三列（管理员/省地接社视角本就需要看全貌）
type MatrixRow = {
  field: string
  pandaking?: string
  agency?: string
  provincial?: string
}
const FULL_MATRIX: MatrixRow[] = [
  { field: '客户档案', pandaking: '✓', agency: '✓(自身)', provincial: '✗' },
  { field: '行程草案(规划)', pandaking: '✓', agency: '✓', provincial: '✓(被分配路线)' },
  { field: '成本①(地接成本)', pandaking: '✓', agency: '✗', provincial: '✓(自身)' },
  { field: '成本②(PandaKing 利润)', pandaking: '✓', agency: '✗', provincial: '✗' },
  { field: '对旅行社报价', pandaking: '✓', agency: '✓', provincial: '✗' },
  { field: '加价/游客价', pandaking: '✓', agency: '✓', provincial: '✗' },
  { field: '知识库', pandaking: '读写', agency: '读', provincial: '✗' },
  { field: '发布案例/全局账号', pandaking: '✓', agency: '✗', provincial: '✗' },
]
const AGENCY_MATRIX: MatrixRow[] = [
  { field: '客户档案', agency: '✓(自身)' },
  { field: '行程草案(规划)', agency: '✓' },
  { field: '报价', agency: '✓' },
  { field: '加价/游客价', agency: '✓' },
  { field: '知识库', agency: '读' },
  { field: '发布案例/全局账号', agency: '✗' },
]
const matrix = computed<MatrixRow[]>(() => (role.value === 'agency' ? AGENCY_MATRIX : FULL_MATRIX))
type MatrixCol = { key: 'pandaking' | 'agency' | 'provincial'; label: string }
const matrixColumns = computed<MatrixCol[]>(() =>
  role.value === 'agency'
    ? [{ key: 'agency', label: '旅行社' }]
    : [
        { key: 'pandaking', label: 'PandaKing' },
        { key: 'agency', label: '旅行社' },
        { key: 'provincial', label: '省地接社' },
      ],
)
// 「已隐藏字段」说明框 + 矩阵底部 tip：agency 视角不展示（2026-07-29 用户要求「这些部分都不要展示」）
const showMatrixExtras = computed(() => role.value !== 'agency')
const matrixTipText =
  '旅行社与省地接社在「价格与信息」上完全物理隔绝：互相不知道对方的存在与数据展示。'

// —— 协作说明文案：agency 视角改写（去掉「省地接社」「看不到 PandaKing 内部信息」等字样） ——
const collabText = computed(() => {
  if (role.value === 'agency') {
    return '本平台采用<b>物理隔绝</b>设计：您只能看到归属于本机构的数据，价格信息按角色严格裁剪，您看到的「我的路线 / 我的询价」仅包含归属于本旅行社的数据。'
  }
  // pandaking / provincial：原版
  return '本平台采用<b>物理隔绝</b>设计： PandaKing、旅行社、省地接社三方数据互不越权可见。旅行社与省地接社互相不知道对方的存在与数据；价格与成本信息按角色严格裁剪。你看到的「我的路线 / 我的询价」仅包含归属于本机构的数据。'
})

function gotoChangePwd() {
  router.push('/change-pwd')
}

// —— 境外旅行社：在「我的」页只读展示其专属提交链接（URL + 使用说明 + 复制）——
// 「提交链接」独立页已从 agency 视角移除（保留给 PandaKing 管理全部机构链接）；
// agency 仅在此查看 PandaKing 预发给本机构的链接，不暴露增删 / 改期等管理操作。
const agencyIntakeLink = ref<IntakeLinkView | null>(null)
const agencyLinkCopied = ref(false)
const agencyIntakeLoading = ref(false)
function intakeFullUrl(link: string) {
  const base = import.meta.env.VITE_BASE || '/'
  return location.origin + base + '#' + link
}
const agencyIntakeFullUrl = computed(() =>
  agencyIntakeLink.value ? intakeFullUrl(agencyIntakeLink.value.link) : '',
)
async function copyAgencyIntakeLink() {
  if (!agencyIntakeLink.value) return
  const ok = await copyText(agencyIntakeFullUrl.value)
  if (ok) {
    agencyLinkCopied.value = true
    setTimeout(() => { agencyLinkCopied.value = false }, 2000)
  }
}
onMounted(async () => {
  if (role.value !== 'agency') return
  agencyIntakeLoading.value = true
  try {
    const links = await listIntakeLinks()
    if (links.length) {
      // 优先展示未过期链接；全部过期则展示最近一条（前端标过期提示）
      agencyIntakeLink.value = links.find((l) => !l.expired) || links[0]
    }
  } catch {
    agencyIntakeLink.value = null
  } finally {
    agencyIntakeLoading.value = false
  }
})

const ROLE_LABEL: Record<Role, string> = {
  pandaking: 'PandaKing',
  agency: '旅行社',
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
      <div class="kv" v-if="user.phone">
        <span>手机号</span>
        <b>{{ user.phone }}</b>
        <button class="btn-pwd" type="button" @click="gotoChangePwd" aria-label="修改密码">🔑 修改密码</button>
      </div>
      <button class="btn btn-primary" @click="onLogout">退出登录</button>
    </div>

    <!-- 境外旅行社：只读展示本机构专属提交链接（URL + 使用说明 + 复制） -->
    <div v-if="role === 'agency'" class="card" style="margin-top: 16px">
      <h3>路线提交链接</h3>
      <p class="muted">这是贵机构专用的路线初稿提交链接，免登录、仅贵机构可使用：</p>

      <p v-if="agencyIntakeLoading" class="muted">加载中…</p>
      <template v-else>
        <div v-if="agencyIntakeLink" class="intake-box">
          <code class="intake-url">{{ agencyIntakeFullUrl }}</code>
          <button class="btn ghost sm" type="button" @click="copyAgencyIntakeLink">
            {{ agencyLinkCopied ? '已复制 ✓' : '复制 URL' }}
          </button>
        </div>
        <p v-if="agencyIntakeLink?.expired" class="warn">该链接已过期，请联系 PandaKing 重新获取。</p>
        <p v-else-if="!agencyIntakeLink" class="muted">暂未获取到提交链接，请联系 PandaKing 为您生成。</p>
      </template>

      <p class="tip">
        使用说明：将链接发给贵社对接人，对方点开即可免登录填报路线初稿（客户名、目的地、人数、出行日期、每日行程）。
        提交后系统自动建单，您可在「我的路线」查看进展与反馈。
      </p>
    </div>

    <div class="card" style="margin-top: 16px">
      <h3>协作说明（物理隔绝）</h3>
      <p class="muted" v-html="collabText"></p>
    </div>

    <div class="card" style="margin-top: 16px">
      <h3>权限矩阵（字段级）</h3>
      <div class="tbl-wrap">
        <table class="tbl matrix">
          <thead>
            <tr>
              <th>字段 / 能力</th>
              <th v-for="col in matrixColumns" :key="col.key">{{ col.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in matrix" :key="row.field">
              <td>{{ row.field }}</td>
              <td v-for="col in matrixColumns" :key="col.key">{{ row[col.key] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <!-- agency 视角不展示矩阵底部 tip（2026-07-29 用户要求「这些部分都不要展示」） -->
      <p v-if="showMatrixExtras" class="tip">{{ matrixTipText }}</p>
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
/* 手机号行内嵌的修改密码入口：白底蓝边次按钮 */
.btn-pwd {
  background: #fff;
  color: #185FA5;
  border: 1px solid #378ADD;
  border-radius: 8px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: background 0.15s;
}
.btn-pwd:hover { background: #E6F1FB; }
/* 机构提交链接只读展示（agency 视角「我的」页） */
.intake-box { display: flex; align-items: center; gap: 8px; margin: 10px 0 4px; }
.intake-url {
  flex: 1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
  color: var(--ink);
}
.warn { color: #c0392b; font-size: 12px; margin: 6px 0 0; }
</style>
