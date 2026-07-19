<script setup lang="ts">
// 协作通知弹窗（统一「发起询价」与「保存并报价」等动作的反馈）
// - 标题：客户+行程+时间核心信息
// - 主体：结构化文案（含 URL）
// - 行为：弹出即自动复制 + 显示「已复制」状态
// - 多轮：每次打开都重新生成（可重复触发）
// - 支持「选择→生成」两步式：slot 区域可放选择控件 + 触发按钮，
//   业务方在生成后通过 watch(text) 触发自动复制。
import { computed, onMounted, ref, watch } from 'vue'
import { copyText } from '@/utils/share'

const props = defineProps<{
  open: boolean
  title: string // 弹窗标题
  text: string // 结构化通知文案（包含主题+正文+URL）
  subtitle?: string // 可选副标题
  /** 是否渲染 slot（用于插入中间控件，如机构下拉） */
  showSlot?: boolean
  /** 自定义生成按钮（仅在 text 为空时显示），点击后由父组件生成 text */
  generateLabel?: string
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'copied'): void
  (e: 'generate'): void
}>()

const copied = ref(false)
const copiedHint = computed(() => (copied.value ? '✅ 已复制，去微信粘贴' : '已自动复制，去微信粘贴'))

async function doCopy() {
  if (!props.text) return
  const ok = await copyText(props.text)
  copied.value = ok
  if (ok) emit('copied')
}

function close() {
  emit('update:open', false)
}

// 每次打开弹窗 + 每次 text 变化 → 重新复制一次
watch(
  () => props.open,
  async (v) => {
    if (v) copied.value = false
    if (v && props.text) await doCopy()
  },
)
watch(
  () => props.text,
  async (v) => {
    copied.value = false
    if (v && props.open) await doCopy()
  },
)
onMounted(() => {
  if (props.open && props.text) doCopy()
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="nd-mask" @click.self="close">
      <div class="nd-modal" role="dialog" aria-modal="true">
        <div class="nd-head">
          <span class="nd-title">{{ title }}</span>
          <button class="nd-close" @click="close" aria-label="关闭">×</button>
        </div>
        <div class="nd-body">
          <p v-if="subtitle" class="nd-sub">{{ subtitle }}</p>
          <slot v-if="showSlot !== false" />
          <div v-if="text" class="nd-text-box">
            <div class="nd-text-head">
              <span class="nd-text-lab">📋 通知文案预览（已自动复制，去微信粘贴）</span>
              <span v-if="copied" class="nd-copied">✅ 已复制</span>
            </div>
            <pre class="nd-text">{{ text }}</pre>
          </div>
          <div class="nd-actions">
            <button v-if="!text && generateLabel" class="nd-btn primary" @click="emit('generate')">{{ generateLabel }}</button>
            <button class="nd-btn ghost" @click="close">关闭</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.nd-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}
.nd-modal {
  background: var(--card, #fff);
  border-radius: 14px;
  width: 100%;
  max-width: 560px;
  max-height: 90vh;
  overflow: auto;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
  font-family: -apple-system, 'PingFang SC', sans-serif;
}
.nd-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--line, #e8edf4);
}
.nd-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--ink, #1c2430);
  flex: 1;
}
.nd-close {
  background: transparent;
  border: none;
  font-size: 22px;
  line-height: 1;
  color: var(--muted, #76819a);
  cursor: pointer;
  padding: 0 6px;
}
.nd-close:hover { color: var(--ink, #1c2430); }
.nd-body {
  padding: 14px 18px 18px;
}
.nd-sub {
  color: var(--muted, #76819a);
  font-size: 13px;
  margin: 0 0 12px;
  line-height: 1.6;
}
.nd-text-box {
  border: 1px solid var(--line, #e8edf4);
  border-radius: 10px;
  background: #fbfcfe;
  padding: 12px 14px;
  margin-top: 12px;
}
.nd-text-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--brand, #c8102e);
  margin-bottom: 8px;
}
.nd-text-lab { font-weight: 600; }
.nd-copied { margin-left: auto; color: var(--ok, #10b981); font-weight: 700; }
.nd-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
  line-height: 1.6;
  color: var(--ink, #1c2430);
  font-family: inherit;
  max-height: 320px;
  overflow: auto;
}
.nd-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}
.nd-btn {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid var(--line, #e8edf4);
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;
  background: var(--surface, #fff);
  color: var(--ink, #1c2430);
}
.nd-btn.primary {
  background: var(--brand, #c8102e);
  color: #fff;
  border-color: var(--brand, #c8102e);
  font-weight: 700;
}
.nd-btn.ghost {
  background: transparent;
  color: var(--muted, #76819a);
}
.nd-btn:hover { opacity: 0.92; }
</style>
