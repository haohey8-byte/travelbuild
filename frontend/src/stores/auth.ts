import { defineStore } from 'pinia'
import { ref } from 'vue'
import i18n from '@/i18n'

// 鉴权与全局上下文（角色切换、语言切换）
export const useAuthStore = defineStore('auth', () => {
  const currentRole = ref<'pandaking' | 'agency' | 'provincial'>('pandaking')
  const locale = ref(localStorage.getItem('locale') || 'zh')
  const token = ref(localStorage.getItem('token') || '')

  function setToken(t: string) {
    token.value = t
    localStorage.setItem('token', t)
  }

  function setLocale(l: string) {
    locale.value = l
    ;(i18n.global as unknown as { locale: { value: string } }).locale.value = l
    localStorage.setItem('locale', l)
  }

  return { currentRole, locale, token, setToken, setLocale }
})
