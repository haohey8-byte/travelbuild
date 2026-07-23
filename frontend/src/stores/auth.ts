import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import i18n from '@/i18n'
import type { Role, User, AdminView } from '@/types'
import {
  devLogin,
  acceptInvite,
  fetchMe,
  login as loginApi,
  changePwd as changePwdApi,
  fetchAdmins as fetchAdminsApi,
  createAdmin as createAdminApi,
  resetAdminPwd as resetAdminPwdApi,
  disableAdmin as disableAdminApi,
} from '@/api/auth'

// 鉴权与全局上下文（角色切换、语言切换、登录态）
export const useAuthStore = defineStore('auth', () => {
  const storedUser = localStorage.getItem('user')
  const parsedUser: User | null = storedUser ? JSON.parse(storedUser) : null
  const locale = ref(localStorage.getItem('locale') || 'zh')
  const token = ref(localStorage.getItem('token') || '')
  const user = ref<User | null>(parsedUser)
  // currentRole 必须与 user.role 保持强一致：页面刷新、loadMe 更新、dev 切换后都自动同步
  const currentRole = computed<Role>(() => user.value?.role ?? 'pandaking')

  function setSession(res: { token: string; user: User }) {
    token.value = res.token
    user.value = res.user
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

  // 手机号 + 密码登录（管理员，真实账号）
  // 返回后端原始结果（含 requireChangePwd），由调用方决定跳转
  async function login(phone: string, password: string) {
    const res = await loginApi(phone, password)
    setSession(res)
    return res
  }

  // 改密（含首次强制改密）
  async function changePwd(oldPwd: string, newPwd: string) {
    const res = await changePwdApi(oldPwd, newPwd)
    // 改密成功后刷新本地会话（mustChangePwd 已置 false）
    setSession({ token: token.value, user: res.user })
  }

  // 管理员管理（以下均限 pandaking）
  async function fetchAdmins(): Promise<AdminView[]> {
    return await fetchAdminsApi()
  }
  async function createAdmin(body: { name: string; phone: string; initPwd: string }) {
    return await createAdminApi(body)
  }
  async function resetAdminPwd(id: string, initPwd: string) {
    return await resetAdminPwdApi(id, initPwd)
  }
  async function disableAdmin(id: string) {
    return await disableAdminApi(id)
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
    login,
    changePwd,
    fetchAdmins,
    createAdmin,
    resetAdminPwd,
    disableAdmin,
    loginByInvite,
    loadMe,
    logout,
  }
})
