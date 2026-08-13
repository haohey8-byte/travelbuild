import type { Directive, DirectiveBinding } from 'vue'

// v-tooltip="'文案'"
// 鼠标悬停 300ms 后显示深色气泡（元素上方居中 + 小箭头），移开立即隐藏；滚动/缩放时自动隐藏。
// 气泡挂 document.body（position:fixed），避免父容器 overflow 裁剪；上方放不下自动翻到下方。
// 用法：<button v-tooltip="'复制标题+链接文案，粘贴到微信发送'">复制分享</button>

const DELAY = 300
let timer: ReturnType<typeof setTimeout> | null = null

function show(el: HTMLElement, text: string) {
  hide()
  const tip = document.createElement('div')
  tip.className = 'v-tip'
  tip.textContent = text
  document.body.appendChild(tip)
  const r = el.getBoundingClientRect()
  const tw = tip.offsetWidth
  const th = tip.offsetHeight
  // 水平居中 + 边缘避让
  let left = r.left + r.width / 2 - tw / 2
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8))
  // 默认显示在上方；上方放不下翻到下方（箭头朝上）
  let top = r.top - th - 8
  if (top < 8) {
    top = r.bottom + 8
    tip.classList.add('v-tip-below')
  }
  tip.style.left = left + 'px'
  tip.style.top = top + 'px'
  // 触发过渡
  requestAnimationFrame(() => tip.classList.add('v-tip-on'))
}

function hide() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const tip = document.querySelector('.v-tip')
  if (tip) tip.remove()
}

// 全局气泡样式（只注入一次）
let styled = false
function ensureStyle() {
  if (styled) return
  styled = true
  const s = document.createElement('style')
  s.textContent =
    '.v-tip{position:fixed;z-index:99999;max-width:280px;padding:6px 10px;border-radius:6px;' +
    'background:rgba(20,32,51,.92);color:#fff;font-size:12px;line-height:1.5;pointer-events:none;' +
    'opacity:0;transform:translateY(3px);transition:opacity .12s,transform .12s;' +
    'word-break:break-word;white-space:nowrap;box-shadow:0 4px 14px rgba(20,32,51,.18)}' +
    '.v-tip::after{content:"";position:absolute;left:50%;bottom:-4px;width:0;height:0;' +
    'border-left:5px solid transparent;border-right:5px solid transparent;' +
    'border-top:5px solid rgba(20,32,51,.92);transform:translateX(-50%)}' +
    '.v-tip-below::after{bottom:auto;top:-4px;border-top:none;' +
    'border-bottom:5px solid rgba(20,32,51,.92)}' +
    '.v-tip-on{opacity:1;transform:translateY(0)}'
  document.head.appendChild(s)
}

export const tooltip: Directive<HTMLElement, string> = {
  mounted(el: HTMLElement, binding: DirectiveBinding<string>) {
    ensureStyle()
    el.dataset.tipText = binding.value || ''
    const enter = () => {
      const t = el.dataset.tipText
      if (!t) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => show(el, t), DELAY)
    }
    ;(el as unknown as { __tipEnter?: () => void }).__tipEnter = enter
    el.addEventListener('mouseenter', enter)
    el.addEventListener('mouseleave', hide)
    window.addEventListener('scroll', hide, true)
    window.addEventListener('resize', hide)
  },
  updated(el: HTMLElement, binding: DirectiveBinding<string>) {
    el.dataset.tipText = binding.value || ''
  },
  beforeUnmount(el: HTMLElement) {
    const enter = (el as unknown as { __tipEnter?: () => void }).__tipEnter
    if (enter) el.removeEventListener('mouseenter', enter)
    el.removeEventListener('mouseleave', hide)
    window.removeEventListener('scroll', hide, true)
    window.removeEventListener('resize', hide)
    delete (el as unknown as { __tipEnter?: () => void }).__tipEnter
  },
}
