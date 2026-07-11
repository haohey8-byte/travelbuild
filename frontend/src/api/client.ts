import axios from 'axios'

// 统一 API 客户端：baseURL=/api（开发期 Vite 代理到 :3000），自动带 JWT
const client = axios.create({ baseURL: '/api', timeout: 10000 })

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      // 未登录跳转微信授权（后续接 auth 模块）
    }
    return Promise.reject(err)
  },
)

export default client
