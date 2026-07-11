<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const tab = ref<'quote' | 'customer' | 'timeline'>('quote')

// 详情三 Tab：Tab1 行程报价 / Tab2 客户信息 / Tab3 沟通时间线（对应 doc/03）
const tabs = [
  { key: 'quote', label: '行程报价' },
  { key: 'customer', label: '客户信息' },
  { key: 'timeline', label: '沟通时间线' },
] as const
</script>

<template>
  <div>
    <h1 class="page-title">路线详情</h1>
    <div class="tab-bar">
      <button v-for="tb in tabs" :key="tb.key" :class="['tab', { active: tab === tb.key }]" @click="tab = tb.key">
        {{ tb.label }}
      </button>
    </div>
    <div class="card tab-body">
      <p v-if="tab === 'quote'">Tab1 行程报价：5 级报价引擎 + 成本①②分离（待 Feature 开发填充）</p>
      <p v-else-if="tab === 'customer'">Tab2 客户信息：客户档案 + 行程草案 + 版本历史</p>
      <p v-else>Tab3 沟通时间线：沟通记录流 + @引用</p>
    </div>
  </div>
</template>

<style scoped>
.tab-bar { display: flex; gap: 8px; margin-bottom: 12px; }
.tab { padding: 8px 16px; border: 1px solid var(--line); background: var(--card); border-radius: 8px; cursor: pointer; }
.tab.active { color: var(--brand); border-color: var(--brand); }
.tab-body { min-height: 200px; color: var(--muted); }
</style>
