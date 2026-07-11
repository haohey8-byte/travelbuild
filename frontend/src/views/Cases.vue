<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <div>
    <h1 class="page-title">{{ t('nav.cases') }}</h1>
    <div class="card">
      <p>案例展示：已确认路线脱敏派生 + 公开 H5 获客（含 4.8.6 合规发布校验）。待 Feature 开发填充。</p>
    </div>
  </div>
</template>
