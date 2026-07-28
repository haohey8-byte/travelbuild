import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// 路由严格对应 doc/03 页面清单
// 使用 hash 模式：URL 带 # 前缀，静态托管服务端永远只看到 /，无需 SPA 回源重写，
// 任意深层页刷新都不会 404。协作 H5 分享卡片走后端 /share 服务端渲染（与前端路由模式无关）。
const router = createRouter({
  history: createWebHashHistory(import.meta.env.VITE_BASE || '/'),
  routes: [
    { path: '/', name: 'home', component: () => import('@/views/Home.vue'), meta: { public: true } },
    // —— 认证页（免登录可访问，独立渲染，无主导航）——
    { path: '/login', name: 'login', component: () => import('@/views/Login.vue'), meta: { authPage: true } },
    { path: '/change-pwd', name: 'change-pwd', component: () => import('@/views/ChangePwd.vue'), meta: { authPage: true } },
    // —— 控制台（需登录）——
    { path: '/routes/kanban', name: 'route-kanban', component: () => import('@/views/RouteKanban.vue') },
    { path: '/routes/list', name: 'route-list', component: () => import('@/views/RouteList.vue') },
    { path: '/routes/:id', name: 'route-detail', component: () => import('@/views/RouteDetail.vue'), props: true },
    { path: '/kb', name: 'kb', component: () => import('@/views/KnowledgeBase.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/views/settings/Settings.vue') },
    { path: '/cases', name: 'cases', component: () => import('@/views/Cases.vue') },
    { path: '/route-archives', name: 'route-archives', component: () => import('@/views/RouteArchives.vue') },
    { path: '/route-archives/:id', name: 'route-archive-detail', component: () => import('@/views/RouteArchiveDetail.vue'), props: true },
    // 协作 H5（公开，免登录，隐藏主导航）
    { path: '/h5/route/:token', name: 'h5-route', component: () => import('@/views/H5Route.vue'), meta: { h5: true } },
    // 一手 PandaKing 移动枢纽：复用控制台 RouteDetail 组件（tokenMode 认 pandakingToken，免登录）。
    // 用于接收省地接/境外社回传通知后，PandaKing 在微信里直接打开该订单的可编辑枢纽页。
    { path: '/h5/pk-route/:token', name: 'h5-pk-route', component: () => import('@/views/RouteDetail.vue'), meta: { h5: true } },
    // 邀请接受 H5（一手/管理员复制链接发到微信群，受邀者打开后接受）
    { path: '/h5/invite/:token', name: 'h5-invite', component: () => import('@/views/H5Invite.vue'), meta: { h5: true } },
    // 成本询价 H5 已退役：统一由「省地接社协作 H5」(H5ProvincialRoute) 承接。
    // 旧 /h5/cost-inquiry/:token 链接（含历史省地接社收到的询价链接）重定向到省地接社协作页；
    // 后端 getH5 会把成本询价令牌兜底解析到其关联的省地接社共享，故旧链接仍可正常打开。
    { path: '/h5/cost-inquiry/:token', redirect: '/h5/provincial-route/:token' },
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
  // 公开首页（营销页）：免登录
  if (to.meta.public) return true
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
  return true
})

export default router
