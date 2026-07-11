<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const auth = useAuthStore()

const nav = [
  { to: '/routes/kanban', label: () => t('nav.routes') },
  { to: '/kb', label: () => t('nav.kb') },
  { to: '/account', label: () => t('nav.account') },
  { to: '/cases', label: () => t('nav.cases') },
]
</script>

<template>
  <div class="app-shell">
    <header class="app-header">
      <div class="brand">PandaKing9 · 协作工作台</div>
      <nav class="app-nav">
        <RouterLink v-for="item in nav" :key="item.to" :to="item.to">{{ item.label() }}</RouterLink>
      </nav>
      <div class="role-switch">
        <label>{{ t('common.role') }}:</label>
        <select v-model="auth.currentRole">
          <option value="pandaking">一手 PandaKing</option>
          <option value="agency">境外旅行社</option>
          <option value="provincial">省地接社</option>
        </select>
        <select v-model="auth.locale" @change="auth.setLocale(($event.target as HTMLSelectElement).value)">
          <option value="zh">中文</option>
          <option value="en">EN</option>
          <option value="th">ไทย</option>
          <option value="ru">RU</option>
        </select>
      </div>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
</template>
