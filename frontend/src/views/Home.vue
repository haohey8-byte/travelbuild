<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const loggedIn = computed(() => !!auth.token)

// 顶部登录入口：已登录 → 进入控制台；未登录 → 登录
const enterHref = computed(() => (loggedIn.value ? '/#/routes/kanban' : '/#/login'))
const enterLabel = computed(() => (loggedIn.value ? '进入控制台' : '登录'))

interface Plate {
  id: string
  no: string
  caption: string
  place: string
  desc: string
  image: string
  alt: string
}

const plates: Plate[] = [
  {
    id: 'sichuan',
    no: 'No.01',
    caption: '「雪线之上」',
    place: '四姑娘山',
    desc: '川西高原的雪山与针叶林',
    image: '/images/sichuan.jpg',
    alt: '四姑娘山雪山与秋林海子',
  },
  {
    id: 'xinjiang',
    no: 'No.02',
    caption: '「湖林之间」',
    place: '喀纳斯湖',
    desc: '北疆的湖光与雪岭',
    image: '/images/xinjiang.jpg',
    alt: '喀纳斯湖与松林',
  },
  {
    id: 'chongqing',
    no: 'No.03',
    caption: '「山城灯火」',
    place: '重庆渝中',
    desc: '夜色里的江岸与楼阁',
    image: '/images/chongqing.jpg',
    alt: '重庆渝中半岛夜色与洪崖洞',
  },
]

function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<template>
  <div class="home">
    <!-- 顶部导航：品牌 + 单一登录入口 -->
    <header class="home-header">
      <div class="home-inner header-inner">
        <div class="brand" @click="scrollTop">
          <span class="brand-name">PandaKing9</span>
          <span class="brand-sub">定制旅行</span>
        </div>
        <nav class="home-nav">
          <a class="btn btn-primary" :href="enterHref">{{ enterLabel }}</a>
        </nav>
      </div>
    </header>

    <!-- 杂志栏目条 -->
    <div class="masthead">
      <div class="home-inner masthead-inner">
        <span class="masthead-meta">VOL.01 · 川渝疆考察笔记 · PANDAKING9</span>
        <span class="masthead-meta dim">ISSUE 2026</span>
      </div>
    </div>

    <!-- Hero -->
    <section class="hero">
      <div class="home-inner hero-inner">
        <span class="eyebrow">VOL.01 · 川渝疆考察笔记</span>
        <h1 class="hero-title">
          把每一次出发，<br />
          先在纸上走一遍。
        </h1>
        <p class="hero-sub">在川渝疆的山与湖之间，画出只属于这一程的路线。</p>
        <a class="btn btn-primary btn-lg hero-cta" :href="enterHref">{{ enterLabel }} →</a>
      </div>
    </section>

    <!-- 精选路线 · 影像笔记 -->
    <section class="plates">
      <div class="home-inner">
        <header class="section-head">
          <h2>精选路线 · 影像笔记</h2>
          <p>三张图，三段路。我们一起看，再一起写。</p>
        </header>
        <div class="plate-grid">
          <article v-for="p in plates" :key="p.id" class="plate">
            <a class="plate-image" :href="enterHref" :aria-label="`${p.caption} ${p.place}`">
              <img :src="p.image" :alt="p.alt" loading="lazy" />
              <span class="plate-no">{{ p.no }}</span>
            </a>
            <div class="plate-caption">
              <h3>{{ p.caption }} <span class="plate-place">{{ p.place }}</span></h3>
              <p>{{ p.desc }}</p>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- 页脚 -->
    <footer class="home-footer">
      <div class="home-inner footer-inner">
        <p class="footer-line">和 PandaKing 我们一起共读、共写。</p>
        <p class="footer-brand">PandaKing9 · 定制旅行协作平台</p>
        <p class="icp">
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener">粤ICP备2026092981号</a>
        </p>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.home {
  min-height: 100vh;
  background: #FFFFFF;
  color: var(--ink);
  display: flex;
  flex-direction: column;
}

/* 容器 */
.home-inner {
  max-width: var(--content-max, 1200px);
  margin: 0 auto;
  padding: 0 clamp(16px, 4vw, 32px);
}

/* ---------- 顶部导航：深蓝横条 ---------- */
.home-header {
  background: var(--brand-600);
  color: #FFFFFF;
  position: sticky;
  top: 0;
  z-index: 30;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.08);
}
.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
}
.brand {
  display: inline-flex;
  align-items: baseline;
  gap: 10px;
  cursor: pointer;
  user-select: none;
}
.brand-name {
  font-weight: 700;
  font-size: 18px;
  letter-spacing: -0.01em;
  color: #FFFFFF;
}
.brand-sub {
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;
}
.home-nav a { text-decoration: none; }

/* 顶部按钮在深蓝条上需要浅蓝填充（与条带区分） */
.home-header .btn-primary {
  background: #FFFFFF;
  border-color: #FFFFFF;
  color: var(--brand-600);
}
.home-header .btn-primary:hover {
  background: var(--brand-50);
  border-color: var(--brand-50);
  color: var(--brand-600);
}

/* ---------- 杂志栏目条（雾蓝 metadata） ---------- */
.masthead {
  background: var(--brand-50);
  border-bottom: 1px solid rgba(12, 68, 124, 0.1);
}
.masthead-inner {
  padding: 10px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  letter-spacing: 0.18em;
  color: var(--brand-600);
  font-weight: 600;
  text-transform: none;
}
.masthead-meta.dim {
  color: var(--brand);
  opacity: 0.7;
}

/* ---------- Hero ---------- */
.hero {
  padding: clamp(56px, 9vw, 110px) 0 clamp(48px, 7vw, 84px);
  background:
    radial-gradient(900px 360px at 80% -20%, rgba(24, 95, 165, 0.10), transparent 60%),
    linear-gradient(180deg, #FFFFFF 0%, var(--bg) 100%);
}
.hero-inner {
  max-width: 920px;
}
.eyebrow {
  display: inline-block;
  padding: 6px 14px;
  background: var(--brand-50);
  color: var(--brand-600);
  border-radius: 999px;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.16em;
}
.hero-title {
  margin: 22px 0 0;
  font-size: clamp(34px, 6.5vw, 56px);
  line-height: 1.18;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-family: "Source Han Serif SC", "Noto Serif SC", "Songti SC",
    "PingFang SC", "Microsoft YaHei", serif;
  color: var(--ink);
}
.hero-sub {
  margin: 22px 0 0;
  max-width: 38em;
  color: var(--ink-2);
  font-size: clamp(15px, 1.8vw, 18px);
  line-height: 1.8;
}
.hero-cta {
  display: inline-flex;
  margin-top: 32px;
  padding: 13px 26px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
}
.btn-lg { padding: 13px 26px; font-size: 15px; }

/* ---------- 精选路线 · 影像笔记 ---------- */
.plates {
  padding: clamp(40px, 6vw, 72px) 0 clamp(56px, 8vw, 96px);
}
.section-head {
  margin-bottom: clamp(28px, 4vw, 44px);
  border-bottom: 1px solid var(--line);
  padding-bottom: 18px;
}
.section-head h2 {
  margin: 0;
  font-size: clamp(22px, 3vw, 28px);
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.section-head p {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 15px;
}
.plate-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: clamp(20px, 2.4vw, 28px);
}
.plate {
  background: #FFFFFF;
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  overflow: hidden;
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}
.plate:hover {
  transform: translateY(-4px);
  box-shadow: var(--sh-md);
}
.plate-image {
  position: relative;
  display: block;
  aspect-ratio: 4 / 3;
  overflow: hidden;
}
.plate-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.5s ease;
}
.plate:hover .plate-image img { transform: scale(1.04); }
.plate-no {
  position: absolute;
  top: 14px;
  left: 14px;
  padding: 5px 12px;
  background: rgba(4, 44, 83, 0.85);
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  border-radius: 999px;
  backdrop-filter: blur(4px);
}
.plate-caption {
  padding: 18px 20px 22px;
}
.plate-caption h3 {
  margin: 0 0 6px;
  font-size: 17px;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.4;
}
.plate-caption h3 .plate-place {
  margin-left: 6px;
  color: var(--ink-2);
  font-weight: 600;
}
.plate-caption p {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
}

/* ---------- 页脚（深蓝） ---------- */
.home-footer {
  background: var(--brand-600);
  color: rgba(255, 255, 255, 0.85);
  padding: clamp(36px, 5vw, 56px) 0;
  margin-top: auto;
}
.footer-inner {
  display: flex;
  flex-direction: column;
  gap: 8px;
  text-align: center;
}
.footer-line {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #FFFFFF;
  letter-spacing: 0.01em;
}
.footer-brand {
  margin: 4px 0 0;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
}
.icp {
  margin: 10px 0 0;
  font-size: 13px;
}
.icp a {
  color: rgba(255, 255, 255, 0.75);
  text-decoration: none;
}
.icp a:hover {
  text-decoration: underline;
  color: #FFFFFF;
}

/* ---------- 移动端 ---------- */
@media (max-width: 640px) {
  .masthead-inner { font-size: 11px; letter-spacing: 0.12em; }
  .hero-cta { width: 100%; justify-content: center; }
}
</style>