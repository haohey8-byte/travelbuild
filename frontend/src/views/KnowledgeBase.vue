<script setup lang="ts">
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <div>
    <h1 class="page-title">{{ t('nav.kb') }}</h1>
    <div class="card">
      <p>知识库：SOP / 话术 / 资源沉淀（一手可增删改，旅行社只读）。待 Feature 开发填充。</p>
    </div>
  </div>
</template>
