<script setup lang="ts">
import { ref } from 'vue'
import { uploadImage } from '@/api/upload'
import { fixImageUrl } from '@/utils/image'

// 封面/每日图上传组件：点击或拖拽选图 → 客户端 canvas 压缩（≤1920px / JPEG q0.85）→ 上传 → 回填 URL
// v-model 绑定 URL 字符串（与 CaseItem.cover / daysContent[].image 同型）
// 预览 src 过 fixImageUrl：兼容历史 cos.storage URL 协议错（https:/ → https://）
const props = defineProps<{
  modelValue?: string | null
  label?: string
  // 提示文案（如"封面图"或"每日主图"）
  hint?: string
  // 紧凑变体：每日卡片内用，矮一点
  compact?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: string | null): void
}>()

const loading = ref(false)
const err = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp']
const MAX_RAW = 10 * 1024 * 1024 // 客户端先拦超大原图（10MB），压缩后通常 <1MB

function pick() {
  inputRef.value?.click()
}

function onFile(e: Event) {
  const target = e.target as HTMLInputElement
  const f = target.files?.[0]
  if (f) void handleFile(f)
  target.value = '' // 允许重复选同一文件
}

async function onDrop(e: DragEvent) {
  e.preventDefault()
  const f = e.dataTransfer?.files?.[0]
  if (f) void handleFile(f)
}

async function handleFile(file: File) {
  err.value = ''
  if (!ACCEPT.includes(file.type)) {
    err.value = '仅支持 jpg / png / webp'
    return
  }
  if (file.size > MAX_RAW) {
    err.value = '原图超过 10MB，请先裁剪或换张'
    return
  }
  loading.value = true
  try {
    const blob = await compressImage(file)
    const fake = new File([blob], 'cover.jpg', { type: 'image/jpeg' })
    const res = await uploadImage(fake)
    if (res.error) {
      err.value = res.error
    } else {
      emit('update:modelValue', res.url)
    }
  } catch (e: any) {
    err.value = e?.response?.data?.message || e?.message || '上传失败'
  } finally {
    loading.value = false
  }
}

function clear() {
  emit('update:modelValue', null)
  err.value = ''
}

// 客户端压缩：≤1920px 长边，输出 JPEG q0.85（封面/主图无需透明度；透明 PNG 转 JPEG 黑底可接受 v1）
function compressImage(file: File, maxDim = 1920, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height)
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas 不可用'))
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('压缩失败'))),
        'image/jpeg',
        quality,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片解码失败'))
    }
    img.src = url
  })
}
</script>

<template>
  <div class="iu">
    <div v-if="label" class="iu-label">{{ label }}</div>
    <div
      class="iu-zone"
      :class="{ loading, compact: compact }"
      @click="pick"
      @dragover.prevent
      @drop="onDrop"
    >
      <img v-if="modelValue && !loading" :src="fixImageUrl(modelValue)" class="iu-preview" alt="预览" />
      <div v-else-if="loading" class="iu-loading">上传中…</div>
      <div v-else class="iu-empty">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M3 16l5-5 4 4 3-3 6 6" />
        </svg>
        <span>{{ hint || '点击或拖拽上传（jpg/png/webp）' }}</span>
      </div>
    </div>
    <div class="iu-bar">
      <span v-if="err" class="iu-err">{{ err }}</span>
      <button v-if="modelValue" type="button" class="iu-clear" @click.stop="clear">移除</button>
    </div>
    <input ref="inputRef" type="file" accept="image/jpeg,image/png,image/webp" hidden @change="onFile" />
  </div>
</template>

<style scoped>
.iu-label { font-size: 13px; color: var(--muted, #888); margin-bottom: 6px; }
.iu-zone {
  width: 100%; min-height: 140px; border: 1px dashed var(--line, #ddd); border-radius: 10px;
  display: flex; align-items: center; justify-content: center; cursor: pointer; overflow: hidden;
  background: var(--card, #fafafa); transition: border-color .15s;
}
.iu-zone:hover { border-color: var(--brand, #185FA5); }
.iu-zone.loading { opacity: .7; cursor: wait; }
.iu-zone.compact { min-height: 90px; }
.iu-zone.compact .iu-preview { max-height: 140px; }
.iu-zone.compact .iu-empty { padding: 10px; }
.iu-zone.compact .iu-empty span { font-size: 11px; }
.iu-preview { width: 100%; max-height: 220px; object-fit: cover; }
.iu-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--muted, #888); font-size: 12px; padding: 16px; text-align: center; }
.iu-loading { color: var(--brand, #185FA5); font-size: 13px; }
.iu-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 4px; min-height: 18px; }
.iu-err { color: var(--danger, #c33); font-size: 12px; }
.iu-clear { background: none; border: none; color: var(--muted, #888); font-size: 12px; cursor: pointer; padding: 2px 6px; }
.iu-clear:hover { color: var(--danger, #c33); }
</style>
