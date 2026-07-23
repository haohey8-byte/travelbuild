import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// 路由严格对应 doc/03 页面清单
// 使用 hash 模式：URL 带 # 前缀，静态托管服务端永远只看到 /，无需 SPA 回源重写，
// 任意深层页刷新都不会 404。协作 H5 分享卡片走后端 /share 服务端渲染（与前端路由模式无关）。
const router = createRouter({
  history: createWebHashHistory(import.meta.env.VITE_BASE || '/'),
  routes: [
    { path: '/', redirect: '/routes/kanban' },
    // —— 认证页（免登录可访问，独立渲染，无主导航）——
    { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { authPage: true } },
    { path: '/change-pwd', name: 'change-pwd', component: () => import('@/views/ChangePwd.vue'), meta: { authPage: true } },
    // —— 控制台（需登录）——
    { path: '/routes/kanban', name: 'route-kanban', component: () => import('@/views/RouteKanban.vue') },
    { path: '/routes/list', name: 'route-list', component: () => import('@/views/RouteList.vue') },
    { path: '/routes/:id', name: 'route-detail', component: () => import('@/views/RouteDetail.vue'), props: true },
    { path: '/kb', name: 'kb', component: () => import('@/views/KnowledgeBase.vue') },
    { path: '/account', name: 'account', component: () => import('@/views/Account.vue') },
    { path: '/cases', name: 'cases', component: () => import('@/views/Cases.vue') },
    { path: '/route-archives', name: 'route-archives', component: () => import('@/views/RouteArchives.vue') },
    { path: '/route-archives/:id', name: 'route-archive-detail', component: () => import('@/views/RouteArchiveDetail.vue'), props: true },
    // 仅一手 PandaKing 可见：管理员管理
    { path: '/admin/admins', name: 'admin-admins', component: () => import('@/views/AdminAdmins.vue'), meta: { requiresPandaking: true } },
    // 协作 H5（公开，免登录，隐藏主导航）
    { path: '/h5/route/:token', name: 'h5-route', component: () => import('@/views/H5Route.vue'), meta: { h5: true } },
    // 邀请接受 H5（一手/管理员复制链接发到微信群，受邀者打开后接受）
    { path: '/h5/invite/:token', name: 'h5-invite', component: () => import('@/views/H5Invite.vue'), meta: { h5: true } },
    // 成本询价 H5（一手复制链接发微信群，省地接社打开填写成本①）
    { path: '/h5/cost-inquiry/:token', name: 'h5-cost-inquiry', component: () => import('@/views/H5CostInquiry.vue'), meta: { h5: true } },
    // 省地接社协作 H5（一手复制链接发微信群，省地接社打开可编辑分配给自己的行程并反馈）
    { path: '/h5/provincial-route/:token', name: 'h5-provincial-route', component: () => import('@/views/H5ProvincialRoute.vue'), meta: { h5: true } },
    // 机构提交链接 H5（外部旅行社凭 PandaKing 预发链接免登录提交路线初稿）
    { path: '/h5/intake/:token', name: 'h5-intake', component: () => import('@/views/H5Intake.vue'), meta: { h5: true } },
  ],
})

// 导航守卫：控制台页需登录；管理员页限 pandaking。
// H5 与认证页（login/change-pwd）永远放行。
router.beforeEach((to) => {
  const auth = useAuthStore()
  // 公开 H5：免登录
  if (to.meta.h5) return true
  // 认证页：login 可匿名访问；change-pwd 必须已登录
  if (to.meta.authPage) {
    if (to.path === '/change-pwd' && !auth.token) return { path: '/login' }
    return true
  }
  // 控制台页：未登录 → 跳登录（带重定向目标）
  if (!auth.token) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }
  // 管理员页限 pandaking
  if (to.meta.requiresPandaking && auth.user?.role !== 'pandaking') {
    return { path: '/routes/kanban' }
  }
  return true
})

export default router
