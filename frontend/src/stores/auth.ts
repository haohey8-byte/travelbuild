import { defineStore } from 'pinia'
import { ref } from 'vue'
import i18n from '@/i18n'
import type { Role, User } from '@/types'
import { devLogin, acceptInvite, fetchMe } from '@/api/auth'

// 鉴权与全局上下文（角色切换、语言切换、登录态）
export const useAuthStore = defineStore('auth', () => {
  const currentRole = ref<Role>('pandaking')
  const locale = ref(localStorage.getItem('locale') || 'zh')
  const token = ref(localStorage.getItem('token') || '')
  const user = ref<User | null>(
    localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null,
  )

  function setSession(res: { token: string; user: User }) {
    token.value = res.token
    user.value = res.user
    currentRole.value = res.user.role
    localStorage.setItem('token', res.token)
    localStorage.setItem('user', JSON.stringify(res.user))
  }

  function setToken(t: string) {
    token.value = t
    localStorage.setItem('token', t)
  }

  function setLocale(l: string) {
    locale.value = l
    ;(i18n.global as unknown as { locale: { value: string } }).locale.value = l
    localStorage.setItem('locale', l)
  }

  // dev 角色切换：以该角色开发登录，使后端字段级可见性真正生效
  async function loginAsRole(role: Role) {
    const res = await devLogin(role)
    setSession(res)
  }

  async function loginByInvite(token: string, name: string) {
    const res = await acceptInvite(token, name)
    setSession(res)
  }

  async function loadMe() {
    if (!token.value) return
    try {
      user.value = await fetchMe()
    } catch {
      /* 401 由拦截器处理 */
    }
  }

  function logout() {
    token.value = ''
    user.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  }

  return {
    currentRole,
    locale,
    token,
    user,
    setToken,
    setLocale,
    setSession,
    loginAsRole,
    loginByInvite,
    loadMe,
    logout,
  }
})
