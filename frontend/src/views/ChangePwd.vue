<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const oldPwd = ref('')
const newPwd = ref('')
const confirmPwd = ref('')
const busy = ref(false)
const err = ref('')

// 首次强制改密：用户记录标记 mustChangePwd
const forced = computed(() => !!auth.user?.mustChangePwd)

const pwdStrong = computed(() => /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(newPwd.value))

function goConsole() {
  const redirect = (route.query.redirect as string) || '/routes/kanban'
  router.replace(redirect)
}

async function onSubmit() {
  err.value = ''
  if (!oldPwd.value) {
    err.value = '请输入原密码'
    return
  }
  if (newPwd.value.length < 8) {
    err.value = '新密码至少 8 位'
    return
  }
  if (newPwd.value !== confirmPwd.value) {
    err.value = '两次输入的新密码不一致'
    return
  }
  busy.value = true
  try {
    await auth.changePwd(oldPwd.value, newPwd.value)
    goConsole()
  } catch (e: any) {
    const code = e?.response?.data?.code
    if (code === 'AUTH_INVALID_CREDENTIALS') {
      err.value = '原密码错误'
    } else {
      err.value = e?.response?.data?.message || '修改失败，请重试'
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page">
    <div class="card login-card">
      <div class="brand">PandaKing9</div>
      <h2 class="title">{{ forced ? '首次登录，请设置新密码' : '修改密码' }}</h2>
      <p v-if="forced" class="muted warn">
        出于安全考虑，首次登录必须修改初始密码后才能继续使用。
      </p>
      <p v-else class="muted">请输入原密码并设置新密码。</p>

      <form class="form" @submit.prevent="onSubmit">
        <label class="lbl">原密码</label>
        <input v-model="oldPwd" class="input" type="password" placeholder="原密码" autocomplete="current-password" />

        <label class="lbl">新密码</label>
        <input v-model="newPwd" class="input" type="password" placeholder="至少 8 位，建议字母+数字" autocomplete="new-password" />
        <span v-if="newPwd && !pwdStrong" class="hint">建议包含字母与数字，至少 8 位</span>

        <label class="lbl">确认新密码</label>
        <input v-model="confirmPwd" class="input" type="password" placeholder="再次输入新密码" autocomplete="new-password" />

        <p v-if="err" class="err">{{ err }}</p>
        <button class="btn btn-primary submit" type="submit" :disabled="busy">
          {{ busy ? '提交中…' : '确认修改' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: var(--bg); }
.login-card { width: 100%; max-width: 380px; text-align: center; }
.brand { font-weight: 800; color: var(--brand); font-size: 20px; letter-spacing: -0.02em; }
.title { margin: 6px 0 4px; font-size: 19px; }
.muted { color: var(--muted); font-size: 13px; margin: 0 0 16px; }
.warn { color: #b45309; }
.form { text-align: left; display: flex; flex-direction: column; gap: 6px; }
.lbl { color: var(--muted); font-size: 13px; margin-top: 6px; }
.input { padding: 11px 12px; border: 1px solid var(--line-strong); border-radius: 10px; background: var(--surface); font-size: 15px; }
.hint { color: var(--muted); font-size: 12px; }
.submit { margin-top: 14px; }
.err { color: var(--danger); font-size: 13px; margin: 8px 0 0; }
</style>
