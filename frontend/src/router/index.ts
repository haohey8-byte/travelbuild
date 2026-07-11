import { createRouter, createWebHistory } from 'vue-router'

// 路由严格对应 doc/03 页面清单
const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/routes/kanban' },
    { path: '/routes/kanban', name: 'route-kanban', component: () => import('@/views/RouteKanban.vue') },
    { path: '/routes/list', name: 'route-list', component: () => import('@/views/RouteList.vue') },
    { path: '/routes/:id', name: 'route-detail', component: () => import('@/views/RouteDetail.vue'), props: true },
    { path: '/kb', name: 'kb', component: () => import('@/views/KnowledgeBase.vue') },
    { path: '/account', name: 'account', component: () => import('@/views/Account.vue') },
    { path: '/cases', name: 'cases', component: () => import('@/views/Cases.vue') },
  ],
})

export default router
