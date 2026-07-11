<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <div>
    <h1 class="page-title">{{ t('nav.account') }}</h1>
    <div class="card">
      <p>账号管理：邀请制成员 + 字段级权限矩阵。待 Feature 开发填充。</p>
    </div>
  </div>
</template>
