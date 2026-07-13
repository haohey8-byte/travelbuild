import { createRouter, createWebHashHistory } from 'vue-router'

// 路由严格对应 doc/03 页面清单
// 使用 hash 模式：所有路由带 # 前缀，静态托管服务端永远只看到 /，无需 404 回退配置
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/routes/kanban' },
    { path: '/routes/kanban', name: 'route-kanban', component: () => import('@/views/RouteKanban.vue') },
    { path: '/routes/list', name: 'route-list', component: () => import('@/views/RouteList.vue') },
    { path: '/routes/:id', name: 'route-detail', component: () => import('@/views/RouteDetail.vue'), props: true },
    { path: '/kb', name: 'kb', component: () => import('@/views/KnowledgeBase.vue') },
    { path: '/account', name: 'account', component: () => import('@/views/Account.vue') },
    { path: '/cases', name: 'cases', component: () => import('@/views/Cases.vue') },
    // 协作 H5（公开，免登录，隐藏主导航）
    { path: '/h5/route/:token', name: 'h5-route', component: () => import('@/views/H5Route.vue'), meta: { h5: true } },
  ],
})

export default router
