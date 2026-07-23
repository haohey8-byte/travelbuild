<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import type { Role } from '@/types'
import SettingsProfile from './SettingsProfile.vue'
import SettingsRoutes from './SettingsRoutes.vue'
import SettingsInquiries from './SettingsInquiries.vue'
import SettingsAdmins from './SettingsAdmins.vue'
import SettingsAgencies from './SettingsAgencies.vue'
import SettingsIntakeLinks from './SettingsIntakeLinks.vue'

const auth = useAuthStore()

interface Section {
  key: string
  label: string
  icon: string
  cmp: unknown
  roles: Role[]
}

// 子组件按 role 门控（D6）：所有登录角色可见「系统设置」单一入口，内部子组件按角色裁切
const allSections: Section[] = [
  { key: 'profile', label: '我的', icon: '👤', cmp: SettingsProfile, roles: ['pandaking', 'agency', 'provincial'] },
  { key: 'routes', label: '我的路线', icon: '🗺', cmp: SettingsRoutes, roles: ['pandaking', 'agency', 'provincial'] },
  { key: 'inquiries', label: '我的询价', icon: '💬', cmp: SettingsInquiries, roles: ['provincial'] },
  { key: 'admins', label: '管理员', icon: '🛡', cmp: SettingsAdmins, roles: ['pandaking'] },
  { key: 'agencies', label: '旅行社管理', icon: '🏢', cmp: SettingsAgencies, roles: ['pandaking'] },
  { key: 'intakeLinks', label: '提交链接', icon: '🔗', cmp: SettingsIntakeLinks, roles: ['pandaking', 'agency'] },
]

const sections = computed(() => allSections.filter((s) => s.roles.includes(auth.currentRole)))
const activeKey = ref('profile')

const activeSection = computed(() => sections.value.find((s) => s.key === activeKey.value) || sections.value[0])

onMounted(() => {
  activeKey.value = sections.value[0]?.key || 'profile'
})
</script>

<template>
  <div class="settings-shell">
    <aside class="settings-side">
      <div class="side-title">系统设置</div>
      <nav class="side-nav">
        <button
          v-for="s in sections"
          :key="s.key"
          class="side-item"
          :class="{ active: s.key === activeKey }"
          @click="activeKey = s.key"
        >
          <span class="si">{{ s.icon }}</span>{{ s.label }}
        </button>
      </nav>
    </aside>

    <main class="settings-main">
      <component :is="activeSection.cmp" />
    </main>
  </div>
</template>

<style scoped>
.settings-shell { display: flex; gap: 20px; align-items: flex-start; }
.settings-side {
  width: 200px;
  flex: none;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  position: sticky;
  top: calc(var(--header-h) + 16px);
}
.side-title { font-weight: 800; font-size: 15px; padding: 6px 10px 12px; color: var(--ink); }
.side-nav { display: flex; flex-direction: column; gap: 4px; }
.side-item {
  display: flex;
  align-items: center;
  gap: 10px;
  text-align: left;
  padding: 11px 12px;
  border: none;
  background: transparent;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-2);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.side-item .si { font-size: 16px; }
.side-item:hover { background: var(--surface-2); color: var(--brand); }
.side-item.active { background: var(--brand-50); color: var(--brand); }
.settings-main { flex: 1; min-width: 0; }

@media (max-width: 860px) {
  .settings-shell { flex-direction: column; }
  .settings-side {
    width: 100%;
    position: static;
    display: flex;
    flex-direction: column;
  }
  .side-nav { flex-direction: row; overflow-x: auto; gap: 6px; }
  .side-item { white-space: nowrap; }
}
</style>
