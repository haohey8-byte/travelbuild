import axios from 'axios'

// 生产环境通过 VITE_API_BASE 指定后端地址（CloudBase 云托管域名，或 EdgeOne 反代 /api）；
// 缺省回退 /api：开发期走 Vite 代理；生产若用 EdgeOne 反代 /api 也走此路。
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || '/api'
const client = axios.create({ baseURL: API_BASE, timeout: 30000 })

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('[API error]', err.config?.method?.toUpperCase?.(), err.config?.url, err.message, err.response?.status, err.response?.data)
    if (err.response?.status === 401) {
      const url = err.config?.url || ''
      // 登录 / 改密 端点自身返回 401（凭证错误）时不清除已有会话，交给页面处理错误提示
      const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/change-pwd')
      if (!isAuthEndpoint && !localStorage.getItem('token')) {
        // 仅当确实无 token 时清理（防止遗留脏 token）；有 token 的会话过期由路由守卫统一处理
      }
      if (!isAuthEndpoint) localStorage.removeItem('token')
    }
    return Promise.reject(err)
  },
)

export default client
