<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { fetchKb, createKb, updateKb, deleteKb } from '@/api/kb'
import { useAuthStore } from '@/stores/auth'
import type { KbEntry } from '@/types'

const auth = useAuthStore()
const { user } = storeToRefs(auth)

const list = ref<KbEntry[]>([])
const loading = ref(true)
const q = ref('')
const category = ref('')

const CATS = ['SOP', '话术', '资源', '目的地知识']

const showForm = ref(false)
const editing = ref<KbEntry | null>(null)
const form = ref({ title: '', category: 'SOP', tags: '', body: '' })
const busy = ref(false)
const err = ref('')

onMounted(load)

async function load() {
  loading.value = true
  err.value = ''
  try {
    list.value = await fetchKb({
      q: q.value.trim() || undefined,
      category: category.value || undefined,
    })
  } catch (e: any) {
    err.value = e?.response?.data?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editing.value = null
  form.value = { title: '', category: 'SOP', tags: '', body: '' }
  showForm.value = true
}
function openEdit(e: KbEntry) {
  editing.value = e
  form.value = {
    title: e.title,
    category: e.category,
    tags: (e.tags || []).join(', '),
    body: e.body,
  }
  showForm.value = true
}
async function onSave() {
  if (!form.value.title.trim() || !form.value.body.trim()) {
    err.value = '请填写标题与正文'
    return
  }
  busy.value = true
  try {
    const payload = {
      title: form.value.title.trim(),
      category: form.value.category,
      tags: form.value.tags.split(',').map((s) => s.trim()).filter(Boolean),
      body: form.value.body.trim(),
    }
    if (editing.value) await updateKb(editing.value.id, payload)
    else await createKb(payload)
    showForm.value = false
    editing.value = null
    await load()
  } catch (e: any) {
    err.value = e?.response?.data?.message || '保存失败'
  } finally {
    busy.value = false
  }
}
async function onDelete(e: KbEntry) {
  if (!confirm(`确认删除「${e.title}」？`)) return
  await deleteKb(e.id)
  await load()
}
</script>

<template>
  <div>
    <div class="page-header">
      <h1 class="page-title">知识库</h1>
      <button v-if="user" class="btn btn-primary" @click="openCreate">+ 新增</button>
    </div>

    <div class="toolbar">
      <input v-model="q" class="search" placeholder="搜索标题 / 正文 / 标签" @keyup.enter="load" />
      <select v-model="category" class="filter" @change="load">
        <option value="">全部分类</option>
        <option v-for="c in CATS" :key="c" :value="c">{{ c }}</option>
      </select>
      <button class="btn" @click="load">搜索</button>
    </div>

    <p v-if="err" class="err">{{ err }}</p>
    <div v-if="showForm && user" class="card form">
      <input v-model="form.title" class="field" placeholder="标题" />
      <select v-model="form.category" class="field">
        <option v-for="c in CATS" :key="c" :value="c">{{ c }}</option>
      </select>
      <input v-model="form.tags" class="field" placeholder="标签，逗号分隔" />
      <textarea v-model="form.body" class="field" rows="5" placeholder="正文"></textarea>
      <div class="row-actions">
        <button class="btn" @click="showForm = false">取消</button>
        <button class="btn btn-primary" :disabled="busy" @click="onSave">保存</button>
      </div>
    </div>

    <p v-if="loading">加载中…</p>
    <div v-else class="kb-grid">
      <div v-for="e in list" :key="e.id" class="card">
        <div class="kb-title">{{ e.title }}</div>
        <div class="kb-meta">{{ e.category }} · {{ (e.tags || []).join(' / ') }}</div>
        <p class="kb-body">{{ e.body.slice(0, 140) }}</p>
        <div v-if="user" class="kb-actions">
          <button class="btn ghost sm" @click="openEdit(e)">编辑</button>
          <button class="btn ghost sm danger" @click="onDelete(e)">删除</button>
        </div>
      </div>
      <p v-if="!list.length" class="muted">暂无知识条目</p>
    </div>
  </div>
</template>

<style scoped>
.page-header { display: flex; align-items: center; justify-content: space-between; }
.toolbar { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
.search { flex: 1; min-width: 200px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 8px; }
.filter { padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; }
.form { margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; }
.field { padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; font-family: inherit; font-size: 14px; }
.row-actions { display: flex; justify-content: flex-end; gap: 8px; }
.kb-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
.kb-title { font-weight: 600; }
.kb-meta { color: var(--muted); font-size: 12px; margin: 4px 0; }
.kb-body { color: var(--muted); font-size: 13px; margin: 0 0 8px; white-space: pre-wrap; }
.kb-actions { display: flex; gap: 8px; }
.muted { color: var(--muted); }
.err { color: var(--danger); }
.btn.ghost { background: transparent; }
.btn.ghost.sm { padding: 2px 8px; font-size: 12px; }
.btn.ghost.danger { color: var(--danger); border-color: var(--danger); }
</style>
