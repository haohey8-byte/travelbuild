<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const route = useRoute()
const auth = useAuthStore()

const isH5 = computed(() => route.meta.h5 === true)

const nav = [
  { to: '/routes/kanban', label: () => t('nav.routes') },
  { to: '/kb', label: () => t('nav.kb') },
  { to: '/account', label: () => t('nav.account') },
  { to: '/cases', label: () => t('nav.cases') },
]
</script>

<template>
  <!-- 公开 H5：独立移动页，无主导航 -->
  <RouterView v-if="isH5" />

  <div v-else class="app-shell">
    <header class="app-header">
      <div class="brand">PandaKing9 · 协作工作台</div>
      <nav class="app-nav">
        <RouterLink v-for="item in nav" :key="item.to" :to="item.to">{{ item.label() }}</RouterLink>
      </nav>
      <div class="role-switch">
        <template v-if="auth.user">
          <span class="who">{{ auth.user.name }}</span>
          <button class="btn" @click="auth.logout()">{{ t('account.logout') }}</button>
        </template>
        <label v-else>{{ t('common.role') }}:</label>
        <select
          v-model="auth.currentRole"
          @change="auth.loginAsRole(($event.target as HTMLSelectElement).value as any)"
        >
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
