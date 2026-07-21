<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { roleLabel } from '@/utils/share'
import type { Role } from '@/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const isH5 = computed(() => route.meta.h5 === true)
const needsLogin = computed(() => !auth.token && !isH5.value)

const nav = computed(() => {
  const base = [{ to: '/account', label: t('nav.account'), icon: '👤' }]
  // 按 PRD 权限矩阵：省地接社无控制台路线视图，仅通过 H5 成本询价交互
  if (auth.user?.role === 'provincial') return base
  return [
    { to: '/routes/kanban', label: t('nav.routes'), icon: '🗺' },
    { to: '/kb', label: t('nav.kb'), icon: '📚' },
    { to: '/cases', label: t('nav.cases'), icon: '🏆' },
    ...base,
  ]
})


const roles: { key: Role; label: string }[] = [
  { key: 'pandaking', label: 'PandaKing' },
  { key: 'agency', label: '境外旅行社' },
  { key: 'provincial', label: '省地接社' },
]

const menuOpen = ref(false)
function toggleMenu() {
  menuOpen.value = !menuOpen.value
}
function closeMenu() {
  menuOpen.value = false
}
// 切换路由时关闭抽屉
function onNav(to: string) {
  closeMenu()
  router.push(to)
}

async function onDevLogin(r: Role) {
  await auth.loginAsRole(r)
}
</script>

<template>
  <!-- 公开 H5：独立移动页，无主导航 -->
  <RouterView v-if="isH5" :key="route.path" />

  <!-- 未登录：开发登录入口 -->
  <div v-else-if="needsLogin" class="login-gate">
    <div class="login-card card">
      <div class="brand">PandaKing9</div>
      <div class="brand-sub">入境游定制协作工作台</div>
      <p class="muted">请选择角色登录（演示环境，走 dev-login）</p>
      <div class="role-btns">
        <button v-for="r in roles" :key="r.key" class="btn btn-primary" @click="onDevLogin(r.key)">
          {{ r.label }}
        </button>
      </div>
    </div>
  </div>

  <div v-else class="app-shell">
    <header class="app-header">
      <button class="hamburger" :class="{ open: menuOpen }" @click="toggleMenu" aria-label="菜单" :aria-expanded="menuOpen">
        <span></span><span></span><span></span>
      </button>
      <div class="brand" @click="onNav(auth.user?.role === 'provincial' ? '/account' : '/routes/kanban')">PandaKing9<span class="brand-sub">协作工作台</span></div>

      <!-- 桌面端内联导航 -->
      <nav class="app-nav">
        <a
          v-for="item in nav"
          :key="item.to"
          :href="item.to"
          :class="{ 'router-link-active': route.path.startsWith(item.to) }"
          @click.prevent="onNav(item.to)"
        >{{ item.label }}</a>
      </nav>

      <!-- 桌面端当前账号信息（真实账号固定角色，不再提供角色切换） -->
      <div class="role-switch">
        <span class="who" v-if="auth.user">{{ auth.user.name }} · {{ roleLabel(auth.user.role) }}</span>
        <button class="btn ghost sm" @click="auth.logout()">{{ t('account.logout') }}</button>
      </div>
    </header>

    <!-- 移动端抽屉 -->
    <transition name="drawer">
      <div v-if="menuOpen" class="drawer-mask" @click="closeMenu"></div>
    </transition>
    <aside class="drawer" :class="{ open: menuOpen }">
      <div class="drawer-head">
        <span class="drawer-title">导航</span>
        <button class="btn ghost sm" @click="closeMenu" aria-label="关闭">✕</button>
      </div>
      <nav class="drawer-nav">
        <a
          v-for="item in nav"
          :key="item.to"
          :href="item.to"
          :class="{ active: route.path.startsWith(item.to) }"
          @click.prevent="onNav(item.to)"
        >
          <span class="di">{{ item.icon }}</span>{{ item.label }}
        </a>
      </nav>
      <div class="drawer-role">
        <div class="dr-label">当前账号</div>
        <div class="who" v-if="auth.user">{{ auth.user.name }} · {{ roleLabel(auth.user.role) }}</div>
        <button class="btn ghost sm full" @click="auth.logout()">{{ t('account.logout') }}</button>
      </div>
    </aside>

    <main class="app-main">
      <!-- key=route.path：保证任何 route 切换（含详情→详情）都重新挂载组件，
           触发 onMounted 重新拉取数据，避免复用组件导致「显示上一条路线的旧数据/空白」 -->
      <RouterView :key="route.path" />
    </main>
  </div>
</template>

<style scoped>
.login-gate { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
.login-card { width: 100%; max-width: 380px; text-align: center; }
.brand { font-weight: 800; color: var(--brand); font-size: 18px; letter-spacing: -0.02em; cursor: pointer; }
.brand-sub { color: var(--muted); font-weight: 500; font-size: 13px; margin-left: 8px; }
.login-card .brand-sub { display: block; margin: 4px 0 12px; }
.muted { color: var(--muted); font-size: 13px; margin: 10px 0 18px; }
.role-btns { display: flex; flex-direction: column; gap: 10px; }

.app-shell { min-height: 100vh; display: flex; flex-direction: column; }
.app-header {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 0 clamp(14px, 3vw, 22px);
  height: var(--header-h);
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  z-index: 30;
}
.app-nav { display: flex; gap: 4px; flex: 1; }
.app-nav a {
  color: var(--ink-2);
  text-decoration: none;
  padding: 8px 14px;
  border-radius: var(--r-sm);
  font-size: var(--fs-sm);
  font-weight: 600;
  transition: background 0.15s, color 0.15s;
}
.app-nav a:hover { background: var(--surface-2); color: var(--brand); }
.app-nav a.router-link-active { color: var(--brand); background: var(--brand-50); }
.role-switch { display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 13px; }
.role-switch select { padding: 6px 8px; border: 1px solid var(--line-strong); border-radius: var(--r-sm); background: var(--surface); }
.who { font-weight: 600; color: var(--ink); }

/* 汉堡按钮：仅移动端可见 */
.hamburger { display: none; flex-direction: column; justify-content: center; gap: 4px; width: 38px; height: 38px; border: none; background: transparent; cursor: pointer; padding: 8px; }
.hamburger span { display: block; height: 2px; width: 20px; background: var(--ink); border-radius: 2px; transition: transform 0.2s, opacity 0.2s; }
.hamburger.open span:nth-child(1) { transform: translateY(6px) rotate(45deg); }
.hamburger.open span:nth-child(2) { opacity: 0; }
.hamburger.open span:nth-child(3) { transform: translateY(-6px) rotate(-45deg); }

/* 抽屉 */
.drawer-mask { position: fixed; inset: 0; background: rgba(18, 26, 41, 0.45); z-index: 40; }
.drawer {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: min(82vw, 320px);
  background: var(--surface);
  z-index: 50;
  transform: translateX(-100%);
  transition: transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
  box-shadow: var(--sh-lg);
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 8px;
}
.drawer.open { transform: translateX(0); }
.drawer-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
.drawer-title { font-weight: 700; font-size: 15px; }
.drawer-nav { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.drawer-nav a {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  border-radius: var(--r-sm);
  color: var(--ink-2);
  text-decoration: none;
  font-weight: 600;
  font-size: 15px;
}
.drawer-nav a .di { font-size: 18px; }
.drawer-nav a:hover { background: var(--surface-2); }
.drawer-nav a.active { background: var(--brand-50); color: var(--brand); }
.drawer-role { margin-top: auto; border-top: 1px solid var(--line); padding-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.dr-label { font-size: var(--fs-xs); color: var(--muted); }
.drawer-role select { padding: 9px 10px; border: 1px solid var(--line-strong); border-radius: var(--r-sm); background: var(--surface); width: 100%; }
.full { width: 100%; }

/* 移动端：隐藏桌面导航，显示汉堡 + 抽屉 */
@media (max-width: 860px) {
  .app-nav, .role-switch { display: none; }
  .hamburger { display: flex; }
  .brand { flex: 1; }
}
</style>
