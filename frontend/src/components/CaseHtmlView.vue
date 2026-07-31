<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// 案例主体 HTML 渲染：沙箱 iframe + srcdoc + 注入自适应高度脚本。
// 服务端已 sanitize（剥 script/on*/javascript:）；iframe sandbox 再隔离一层（防 DB 被污染的纵深防御）。
// 编辑预览与公开页共用此组件，保证所见即所得。
const props = defineProps<{ html?: string | null }>()
const emit = defineEmits<{ (e: 'loaded'): void }>()

const height = ref(600)
const iframeRef = ref<HTMLIFrameElement | null>(null)

// 注入自适应高度脚本：load/resize 时 postMessage 文档高度给父窗口。
// 用 '</'+'script>' 拼接，避免 SFC 解析器误判 <script> 结束。
const RESIZE_SCRIPT =
  '<scr' + 'ipt>(function(){function h(){try{parent.postMessage({__caseHtmlHeight:document.documentElement.scrollHeight},"*")}catch(e){}}window.addEventListener("load",h);window.addEventListener("resize",h);setTimeout(h,200);setTimeout(h,800);setTimeout(h,2000)})()</scr' + 'ipt>'

const srcdoc = computed(() => (props.html || '') + RESIZE_SCRIPT)

function onMsg(e: MessageEvent) {
  // 仅信任来自本 iframe contentWindow 的消息
  if (iframeRef.value && e.source !== iframeRef.value.contentWindow) return
  const d = e.data as any
  if (d && typeof d.__caseHtmlHeight === 'number' && d.__caseHtmlHeight > 0) {
    // 钳制：最小 200；上限 100000（长单文件微站如北疆攻略 1.3MB 远超 6000px，原 6000 会截断只剩头部）
    height.value = Math.min(Math.max(Math.round(d.__caseHtmlHeight), 200), 100000)
    emit('loaded')
  }
}

onMounted(() => window.addEventListener('message', onMsg))
onBeforeUnmount(() => window.removeEventListener('message', onMsg))
</script>

<template>
  <div v-if="html" class="chv">
    <iframe
      ref="iframeRef"
      class="chv-frame"
      :srcdoc="srcdoc"
      :style="{ height: height + 'px' }"
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      loading="lazy"
      title="案例内容"
    ></iframe>
  </div>
  <div v-else class="chv-empty">暂无内容 HTML</div>
</template>

<style scoped>
.chv { width: 100%; }
.chv-frame {
  width: 100%; border: 0; display: block; border-radius: 10px;
  background: var(--card, #fff); min-height: 200px;
}
.chv-empty { color: var(--muted, #888); font-size: 13px; padding: 16px; text-align: center; }
</style>
