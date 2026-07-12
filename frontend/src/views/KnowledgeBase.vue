<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { fetchKb, createKb } from '@/api/kb'
import { useAuthStore } from '@/stores/auth'
import type { KbEntry } from '@/types'

const { t } = useI18n()
const auth = useAuthStore()
const { user } = storeToRefs(auth)

const list = ref<KbEntry[]>([])
const loading = ref(true)
const q = ref('')

const showForm = ref(false)
const form = ref({ title: '', category: 'SOP', tags: '', body: '' })
const busy = ref(false)

onMounted(load)

async function load() {
  loading.value = true
  try {
    list.value = await fetchKb({ q: q.value.trim() || undefined })
  } finally {
    loading.value = false
  }
}

async function onSearch() {
  await load()
}

async function onCreate() {
  if (!form.value.title.trim() || !form.value.body.trim()) return
  busy.value = true
  try {
    await createKb({
      title: form.value.title.trim(),
      category: form.value.category,
      tags: form.value.tags.split(',').map((s) => s.trim()).filter(Boolean),
      body: form.value.body.trim(),
    })
    form.value = { title: '', category: 'SOP', tags: '', body: '' }
    showForm.value = false
    await load()
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <h1 class="page-title">{{ t('nav.kb') }}</h1>
    <div class="toolbar">
      <input v-model="q" class="search" placeholder="搜索 SOP / 话术 / 资源" @keyup.enter="onSearch" />
      <button class="btn" @click="onSearch">搜索</button>
      <button v-if="user" class="btn btn-primary" @click="showForm = !showForm">
        {{ showForm ? '取消' : '新增' }}
      </button>
    </div>

    <div v-if="showForm && user" class="card form">
      <input v-model="form.title" class="field" placeholder="标题" />
      <input v-model="form.category" class="field" placeholder="分类（如 SOP）" />
      <input v-model="form.tags" class="field" placeholder="标签，逗号分隔" />
      <textarea v-model="form.body" class="field" rows="4" placeholder="正文"></textarea>
      <button class="btn btn-primary" :disabled="busy" @click="onCreate">保存</button>
    </div>

    <p v-if="loading">{{ t('common.loading') }}</p>
    <div v-else class="kb-grid">
      <div v-for="e in list" :key="e.id" class="card">
        <div class="kb-title">{{ e.title }}</div>
        <div class="kb-meta">{{ e.category }} · {{ e.tags.join(' / ') }}</div>
        <p class="kb-body">{{ e.body.slice(0, 120) }}</p>
      </div>
      <p v-if="!list.length" class="muted">{{ t('common.empty') }}</p>
    </div>
  </div>
</template>

<style scoped>
.toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.search { flex: 1; min-width: 200px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; }
.form { margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; }
.field { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-family: inherit; font-size: 14px; }
.kb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.kb-title { font-weight: 600; }
.kb-meta { color: var(--muted); font-size: 12px; margin: 4px 0; }
.kb-body { color: var(--muted); font-size: 13px; margin: 0; }
.muted { color: var(--muted); }
</style>
