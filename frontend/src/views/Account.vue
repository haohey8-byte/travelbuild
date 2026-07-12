<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types'

const { t } = useI18n()
const auth = useAuthStore()
const { user, currentRole } = storeToRefs(auth)

const roles: { key: Role; label: string }[] = [
  { key: 'pandaking', label: '一手 PandaKing' },
  { key: 'agency', label: '境外旅行社' },
  { key: 'provincial', label: '省地接社' },
]

const inviteToken = ref('')
const inviteName = ref('')
const busy = ref(false)
const err = ref('')

async function onDevLogin(role: Role) {
  err.value = ''
  busy.value = true
  try {
    await auth.loginAsRole(role)
  } catch (e: any) {
    err.value = e?.response?.data?.message || '登录失败（请确认后端已连库并 seed）'
  } finally {
    busy.value = false
  }
}

async function onAcceptInvite() {
  err.value = ''
  if (!inviteToken.value.trim() || !inviteName.value.trim()) {
    err.value = '请填写邀请令牌与名称'
    return
  }
  busy.value = true
  try {
    await auth.loginByInvite(inviteToken.value.trim(), inviteName.value.trim())
    inviteToken.value = ''
    inviteName.value = ''
  } catch (e: any) {
    err.value = e?.response?.data?.message || '邀请接受失败'
  } finally {
    busy.value = false
  }
}

function onLogout() {
  auth.logout()
}
</script>

<template>
  <div>
    <h1 class="page-title">{{ t('nav.account') }}</h1>

    <div v-if="user" class="card">
      <p class="muted">{{ t('account.loggedInAs') }}</p>
      <div class="kv"><span>{{ t('account.name') }}</span><b>{{ user.name }}</b></div>
      <div class="kv"><span>{{ t('common.role') }}</span><b>{{ roles.find((r) => r.key === user!.role)?.label || user!.role }}</b></div>
      <button class="btn btn-primary" @click="onLogout">{{ t('account.logout') }}</button>
    </div>

    <div v-else class="grid-2">
      <div class="card">
        <h3>{{ t('account.devLogin') }}</h3>
        <p class="muted">{{ t('account.devLoginHint') }}</p>
        <div class="role-btns">
          <button
            v-for="r in roles"
            :key="r.key"
            class="btn"
            :class="{ 'btn-primary': currentRole === r.key }"
            :disabled="busy"
            @click="onDevLogin(r.key)"
          >{{ r.label }}</button>
        </div>
      </div>

      <div class="card">
        <h3>{{ t('account.acceptInvite') }}</h3>
        <label class="field">
          <span>{{ t('account.inviteToken') }}</span>
          <input v-model="inviteToken" placeholder="invite token" />
        </label>
        <label class="field">
          <span>{{ t('account.yourName') }}</span>
          <input v-model="inviteName" placeholder="your name" />
        </label>
        <button class="btn btn-primary" :disabled="busy" @click="onAcceptInvite">
          {{ t('account.submit') }}
        </button>
      </div>
    </div>

    <p v-if="err" class="err">{{ err }}</p>
  </div>
</template>

<style scoped>
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.muted { color: var(--muted); font-size: 13px; }
.role-btns { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
.kv { display: flex; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--line); }
.kv span { color: var(--muted); width: 60px; }
.field { display: flex; flex-direction: column; gap: 4px; margin: 10px 0; font-size: 13px; color: var(--muted); }
.field input { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-size: 14px; }
.err { color: var(--danger); margin-top: 12px; }
h3 { margin: 0 0 4px; }
</style>
