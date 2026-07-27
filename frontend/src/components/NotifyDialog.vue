<script setup lang="ts">
// 协作通知弹窗（统一「发起询价」与「保存并报价」等动作的反馈）
// - 标题：客户+行程+时间核心信息
// - 主体：结构化文案（含 URL）
// - 行为：弹出时尽力自动复制（桌面安全上下文生效）；并提供「复制（含链接）」按钮，
//        由用户点击触发（新鲜手势，微信/iOS webview 也可靠），作为主复制入口。
// - 多轮：每次打开都重新生成（可重复触发）。
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
const copyHint = computed(() =>
  copied.value ? '✅ 已复制到剪贴板，去微信粘贴' : '若未自动复制，点「复制（含链接）」按钮手动复制',
)

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
              <span class="nd-text-lab">📋 通知文案预览（点「复制」按钮，去微信粘贴）</span>
              <span v-if="copied" class="nd-copied">✅ 已复制</span>
            </div>
            <pre class="nd-text">{{ text }}</pre>
            <p v-if="!copied" class="nd-hint">{{ copyHint }}</p>
          </div>
          <div class="nd-actions">
            <button v-if="text" class="btn btn-primary" @click="doCopy">{{ copied ? '✅ 已复制（点可再复制）' : '📋 复制（含链接）' }}</button>
            <button v-if="!text && generateLabel" class="btn btn-primary" @click="emit('generate')">{{ generateLabel }}</button>
            <button class="btn btn-ghost" @click="close">关闭</button>
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
  background: rgba(18, 26, 41, 0.5);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}
.nd-modal {
  background: var(--surface);
  border-radius: var(--r-lg);
  width: 100%;
  max-width: 460px;
  max-height: 92vh;
  overflow: auto;
  box-shadow: var(--sh-lg);
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
  border-radius: var(--r-sm);
  background: var(--surface-2);
  padding: 12px 14px;
  margin-top: 12px;
}
.nd-text-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--brand);
  margin-bottom: 8px;
}
.nd-text-lab { font-weight: 600; }
.nd-copied { margin-left: auto; color: var(--ok, #10b981); font-weight: 700; }
.nd-hint { margin: 8px 0 0; font-size: 12px; color: var(--muted, #76819a); line-height: 1.5; }
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
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}
/* 按钮复用全局 .btn 体系（btn / btn-primary / btn-ghost），已在模板中改用全局 class */
</style>
