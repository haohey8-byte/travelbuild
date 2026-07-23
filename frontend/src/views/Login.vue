<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { roleLabel } from '@/utils/share'
import type { Role, LoginResult } from '@/types'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const phone = ref('')
const password = ref('')
const busy = ref(false)
const err = ref('')
const showDev = ref(false)

const rememberDev = computed(() => import.meta.env.DEV)

const roles: { key: Role; label: string }[] = [
  { key: 'pandaking', label: 'PandaKing' },
  { key: 'agency', label: '境外旅行社' },
  { key: 'provincial', label: '省地接社' },
]

function afterLogin(res: LoginResult) {
  // 首次强制改密：必须先改密码
  if (res.requireChangePwd || res.user.mustChangePwd) {
    router.replace('/change-pwd')
    return
  }
  const redirect = (route.query.redirect as string) || '/routes/kanban'
  router.replace(redirect)
}

async function onSubmit() {
  err.value = ''
  if (!/^1[3-9]\d{9}$/.test(phone.value.trim())) {
    err.value = '请输入有效的 11 位手机号'
    return
  }
  if (!password.value) {
    err.value = '请输入密码'
    return
  }
  busy.value = true
  try {
    const res = await auth.login(phone.value.trim(), password.value)
    afterLogin(res)
  } catch (e: any) {
    const code = e?.response?.data?.code
    if (code === 'AUTH_LOCKED') {
      err.value = e?.response?.data?.message || '登录失败次数过多，请稍后再试'
    } else if (code === 'AUTH_INVALID_CREDENTIALS') {
      err.value = '手机号或密码错误'
    } else if (code === 'AGENCY_DISABLED') {
      err.value = e?.response?.data?.message || '该旅行社账号已被禁用，暂时无法登录'
    } else {
      err.value = e?.response?.data?.message || '登录失败，请稍后重试'
    }
  } finally {
    busy.value = false
  }
}

async function onDevLogin(r: Role) {
  err.value = ''
  busy.value = true
  try {
    await auth.loginAsRole(r)
    router.replace((route.query.redirect as string) || '/routes/kanban')
  } catch (e: any) {
    err.value = e?.response?.data?.message || '开发登录失败'
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  if (auth.token) {
    router.replace((route.query.redirect as string) || '/routes/kanban')
  }
})
</script>

<template>
  <div class="login-page">
    <div class="login-card card">
      <div class="brand">PandaKing9</div>
      <div class="brand-sub">入境游定制协作工作台</div>
      <h2 class="title">管理员登录</h2>
      <p class="muted">使用手机号 + 密码登录控制台</p>

      <form class="form" @submit.prevent="onSubmit">
        <label class="lbl">手机号</label>
        <input
          v-model="phone"
          class="input"
          type="tel"
          inputmode="numeric"
          maxlength="11"
          placeholder="11 位手机号"
          autocomplete="username"
        />
        <label class="lbl">密码</label>
        <input
          v-model="password"
          class="input"
          type="password"
          placeholder="登录密码"
          autocomplete="current-password"
        />
        <p v-if="err" class="err">{{ err }}</p>
        <button class="btn btn-primary submit" type="submit" :disabled="busy">
          {{ busy ? '登录中…' : '登录' }}
        </button>
      </form>

      <div v-if="rememberDev" class="dev-block">
        <button class="link-btn" type="button" @click="showDev = !showDev">
          {{ showDev ? '收起开发调试登录' : '开发调试登录（本地 DEV_BYPASS_AUTH）' }}
        </button>
        <div v-if="showDev" class="role-btns">
          <button
            v-for="r in roles"
            :key="r.key"
            class="btn"
            :disabled="busy"
            @click="onDevLogin(r.key)"
          >{{ roleLabel(r.key) }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: var(--bg); }
.login-card { width: 100%; max-width: 380px; text-align: center; }
.brand { font-weight: 800; color: var(--brand); font-size: 20px; letter-spacing: -0.02em; }
.brand-sub { color: var(--muted); font-weight: 500; font-size: 13px; margin: 4px 0 18px; }
.title { margin: 0 0 4px; font-size: 20px; }
.muted { color: var(--muted); font-size: 13px; margin: 0 0 18px; }
.form { text-align: left; display: flex; flex-direction: column; gap: 6px; }
.lbl { color: var(--muted); font-size: 13px; margin-top: 6px; }
.input { padding: 11px 12px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); font-size: 15px; }
.submit { margin-top: 14px; }
.err { color: var(--danger); font-size: 13px; margin: 8px 0 0; }
.role-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; justify-content: center; }
.dev-block { margin-top: 20px; border-top: 1px solid var(--line); padding-top: 14px; }
.link-btn { background: transparent; border: none; color: var(--brand); cursor: pointer; font-size: 13px; }
</style>
