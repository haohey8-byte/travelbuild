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
      localStorage.removeItem('token')
      // 未登录跳转微信授权（后续接 auth 模块）
    }
    return Promise.reject(err)
  },
)

export default client
