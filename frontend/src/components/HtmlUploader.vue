<script setup lang="ts">
import { computed, ref } from 'vue'
import { uploadHtml } from '@/api/upload'
import CaseHtmlView from './CaseHtmlView.vue'
import type { UploadHtmlStats } from '@/types'

// HTML 单文件上传：选 .html → 读文本 → uploadHtml（后端 sanitize）→ 回填 sanitize 后的 HTML + 显示剥离警告 + 预览
// v-model 绑定 sanitize 后的 HTML 字符串（与 CaseItem.contentHtml 同型）
const props = defineProps<{
  modelValue?: string | null
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: string | null): void
}>()

const loading = ref(false)
const err = ref('')
const stats = ref<UploadHtmlStats | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)

const warnings = computed(() => {
  const s = stats.value
  if (!s) return []
  const w: string[] = []
  if (s.strippedTags.length) w.push(`已剥离标签：${s.strippedTags.join('、')}`)
  if (s.strippedAttrs.length) w.push(`已剥离属性：${s.strippedAttrs.join('、')}`)
  return w
})

function pick() {
  inputRef.value?.click()
}

function onFile(e: Event) {
  const target = e.target as HTMLInputElement
  const f = target.files?.[0]
  if (f) void handleFile(f)
  target.value = ''
}

async function onDrop(e: DragEvent) {
  e.preventDefault()
  const f = e.dataTransfer?.files?.[0]
  if (f) void handleFile(f)
}

async function handleFile(file: File) {
  err.value = ''
  stats.value = null
  const name = file.name.toLowerCase()
  if (!name.endsWith('.html') && !name.endsWith('.htm') && file.type !== 'text/html') {
    err.value = '请上传 .html 文件'
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    err.value = 'HTML 文件超过 5MB 上限'
    return
  }
  loading.value = true
  try {
    const text = await file.text()
    const res = await uploadHtml(text)
    if (res.error) {
      err.value = res.error
      return
    }
    stats.value = res.stats
    emit('update:modelValue', res.html)
  } catch (e: any) {
    err.value = e?.response?.data?.message || e?.message || '上传失败'
  } finally {
    loading.value = false
  }
}

function clear() {
  emit('update:modelValue', null)
  stats.value = null
  err.value = ''
}
</script>

<template>
  <div class="hu">
    <div
      class="hu-zone"
      :class="{ loading }"
      @click="pick"
      @dragover.prevent
      @drop="onDrop"
    >
      <div v-if="loading" class="hu-loading">解析中…（服务端 sanitize）</div>
      <div v-else class="hu-empty">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
        </svg>
        <span>点击或拖拽上传 .html 文件（≤5MB）</span>
      </div>
    </div>

    <div v-if="warnings.length" class="hu-warn">
      <div v-for="w in warnings" :key="w">⚠ {{ w }}</div>
    </div>
    <div v-if="err" class="hu-err">{{ err }}</div>

    <div v-if="modelValue" class="hu-preview">
      <div class="hu-preview-bar">
        <span>预览（sanitize 后）</span>
        <button type="button" class="hu-clear" @click="clear">移除内容</button>
      </div>
      <CaseHtmlView :html="modelValue" />
    </div>

    <input ref="inputRef" type="file" accept=".html,.htm,text/html" hidden @change="onFile" />
  </div>
</template>

<style scoped>
.hu-zone {
  width: 100%; min-height: 90px; border: 1px dashed var(--line, #ddd); border-radius: 10px;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  background: var(--card, #fafafa); transition: border-color .15s;
}
.hu-zone:hover { border-color: var(--brand, #185FA5); }
.hu-zone.loading { opacity: .7; cursor: wait; }
.hu-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--muted, #888); font-size: 12px; padding: 14px; text-align: center; }
.hu-loading { color: var(--brand, #185FA5); font-size: 13px; }
.hu-warn { margin-top: 6px; padding: 6px 10px; background: #fff7e6; border: 1px solid #ffd591; border-radius: 8px; color: #874d00; font-size: 12px; }
.hu-warn div { line-height: 1.6; }
.hu-err { margin-top: 6px; color: var(--danger, #c33); font-size: 12px; }
.hu-preview { margin-top: 10px; }
.hu-preview-bar { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted, #888); margin-bottom: 6px; }
.hu-clear { background: none; border: none; color: var(--muted, #888); font-size: 12px; cursor: pointer; padding: 2px 6px; }
.hu-clear:hover { color: var(--danger, #c33); }
</style>
