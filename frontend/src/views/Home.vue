<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const loggedIn = computed(() => !!auth.token)

// 顶部登录入口：已登录 → 进入控制台；未登录 → 登录
const enterHref = computed(() => (loggedIn.value ? '/#/routes/kanban' : '/#/login'))
const enterLabel = computed(() => (loggedIn.value ? '进入控制台' : '登录'))

interface RouteCard {
  id: string
  region: string
  title: string
  days: string
  gradient: string
  summary: string
  highlights?: string[]
  itinerary?: string[]
}

const routes: RouteCard[] = [
  {
    id: 'sichuan',
    region: '四川',
    title: '成都—四姑娘山—毕棚沟—达古冰川',
    days: '5 天 4 晚',
    gradient: 'linear-gradient(135deg, #1e5fa8 0%, #4aa3df 100%)',
    summary:
      '高原雪山与原始森林交织：四姑娘山幺妹峰、毕棚沟彩林、达古冰川亿年寒冰，一次看尽川西精华。',
    highlights: ['四姑娘山双桥沟', '毕棚沟徒步', '达古冰川缆车'],
  },
  {
    id: 'xinjiang',
    region: '新疆',
    title: '北疆环线 7 日 · 阿勒泰—喀纳斯—禾木',
    days: '7 天 6 晚',
    gradient: 'linear-gradient(135deg, #c2560d 0%, #f0a44d 100%)',
    summary:
      'S21 沙漠公路、阿禾公路、喀纳斯湖与禾木晨雾，北疆秋色与图瓦人村落一次看够。',
    itinerary: [
      'D1 接机，住乌鲁木齐',
      'D2 乌鲁木齐—S21 沙漠公路—阿勒泰',
      'D3 阿勒泰—阿禾公路—禾木',
      'D4 禾木—喀纳斯',
      'D5 喀纳斯—五彩滩—布尔津',
      'D6 布尔津—乌伦古湖—乌鲁木齐',
      'D7 送机',
    ],
  },
  {
    id: 'chongqing',
    region: '重庆',
    title: '重庆一日游 · 大足石刻',
    days: '1 日',
    gradient: 'linear-gradient(135deg, #6b46c1 0%, #a78bda 100%)',
    summary:
      '世界文化遗产大足石刻，唐宋摩崖造像巅峰之作，一日读懂千年石窟艺术与东方美学。',
    highlights: ['宝顶山摩崖造像', '北山石窟', '大足石刻博物馆'],
  },
]

function go(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
</script>

<template>
  <div class="home">
    <!-- 顶部导航：品牌 + 登录入口（用户要求登录放顶端，不直视登录窗） -->
    <header class="home-header">
      <div class="home-inner header-inner">
        <div class="brand" @click="go('top')">PandaKing9<span class="brand-sub">定制旅行</span></div>
        <nav class="home-nav">
          <a href="#routes" @click.prevent="go('routes')">精选路线</a>
          <a href="#about" @click.prevent="go('about')">为何选择</a>
          <a class="btn btn-primary" :href="enterHref">{{ enterLabel }}</a>
        </nav>
      </div>
    </header>

    <!-- Hero -->
    <section id="top" class="hero">
      <div class="home-inner">
        <span class="eyebrow">川渝疆 · 专业定制旅行</span>
        <h1 class="hero-title">把川渝疆交给专业的人，<br />你只管看风景</h1>
        <p class="hero-sub">
          PandaKing9 专注四川、重庆、新疆的高端定制路线，专业包车带司导，行程透明、报价清晰，
          一趟行程自在如风。
        </p>
        <div class="hero-cta">
          <a class="btn btn-primary lg" href="#routes" @click.prevent="go('routes')">查看精选路线</a>
          <a class="btn ghost lg" :href="enterHref">{{ loggedIn ? '进入控制台' : '登录后台' }}</a>
        </div>
        <div class="hero-stats">
          <div><b>3</b><span>核心目的地</span></div>
          <div class="sep"></div>
          <div><b>7 天</b><span>北疆环线</span></div>
          <div class="sep"></div>
          <div><b>1 对 1</b><span>司导定制</span></div>
        </div>
      </div>
    </section>

    <!-- 精选路线 -->
    <section id="routes" class="routes">
      <div class="home-inner">
        <div class="section-head">
          <h2>精选旅行路线</h2>
          <p>覆盖四川高原、重庆石刻、新疆北疆秋色，专业线路策划，图文一目了然。</p>
        </div>

        <div class="route-grid">
          <article v-for="r in routes" :key="r.id" class="route-card card">
            <div class="route-cover" :style="{ background: r.gradient }">
              <span class="route-region">{{ r.region }}</span>
              <span class="route-days">{{ r.days }}</span>
              <!-- 雪山（四川） -->
              <svg v-if="r.id === 'sichuan'" class="cover-art" viewBox="0 0 200 90" fill="none">
                <circle cx="158" cy="26" r="14" fill="#fff" opacity="0.85" />
                <path d="M0 90 L48 38 L78 70 L112 30 L150 72 L200 44 L200 90 Z" fill="#fff" opacity="0.18" />
                <path d="M0 90 L60 52 L92 78 L128 46 L168 80 L200 60 L200 90 Z" fill="#fff" opacity="0.28" />
              </svg>
              <!-- 湖泊秋色（新疆） -->
              <svg v-else-if="r.id === 'xinjiang'" class="cover-art" viewBox="0 0 200 90" fill="none">
                <path d="M0 64 Q40 50 80 64 T160 64 T200 64 L200 90 L0 90 Z" fill="#fff" opacity="0.2" />
                <path d="M0 74 Q50 62 100 74 T200 74 L200 90 L0 90 Z" fill="#fff" opacity="0.3" />
                <path d="M30 60 l8 -22 l8 22 Z M52 60 l7 -18 l7 18 Z M150 60 l9 -24 l9 24 Z" fill="#fff" opacity="0.5" />
              </svg>
              <!-- 石窟浮雕（重庆） -->
              <svg v-else class="cover-art" viewBox="0 0 200 90" fill="none">
                <rect x="24" y="22" width="152" height="56" rx="10" fill="#fff" opacity="0.16" />
                <path d="M60 78 V46 a20 20 0 0 1 40 0 V78" stroke="#fff" stroke-width="3" opacity="0.55" fill="none" />
                <circle cx="80" cy="40" r="6" fill="#fff" opacity="0.6" />
                <rect x="118" y="40" width="34" height="30" rx="4" fill="#fff" opacity="0.35" />
              </svg>
            </div>

            <div class="route-body">
              <h3 class="route-title">{{ r.title }}</h3>
              <p class="route-summary">{{ r.summary }}</p>

              <ul v-if="r.itinerary && r.itinerary.length" class="route-list">
                <li v-for="(d, i) in r.itinerary" :key="i">{{ d }}</li>
              </ul>
              <div v-else class="route-tags">
                <span v-for="h in r.highlights" :key="h" class="badge">{{ h }}</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>

    <!-- 为何选择 -->
    <section id="about" class="about">
      <div class="home-inner">
        <div class="section-head">
          <h2>为何选择 PandaKing9</h2>
          <p>不是模板化跟团，而是围绕你的时间与偏好，由专业司导落地的真实定制。</p>
        </div>
        <div class="about-grid">
          <div class="about-item">
            <div class="about-ic">🗺️</div>
            <h4>聚焦川渝疆</h4>
            <p>深耕四川、重庆、新疆路线，当地司导与资源一手掌握，不走马观花。</p>
          </div>
          <div class="about-item">
            <div class="about-ic">🚐</div>
            <h4>包车带司导</h4>
            <p>专业司机兼向导，行程节奏你定，沿途讲解与协助一站到位。</p>
          </div>
          <div class="about-item">
            <div class="about-ic">💡</div>
            <h4>透明报价</h4>
            <p>行程与报价一体生成，成本、利润、对客价清晰可溯，协作不扯皮。</p>
          </div>
        </div>
      </div>
    </section>

    <!-- 咨询 CTA -->
    <section id="consult" class="consult">
      <div class="home-inner consult-inner">
        <h2>需要为你量身定制一条路线？</h2>
        <p>告诉我们出行人数与期望时间，专业顾问为你规划行程与透明报价。</p>
        <div class="consult-cta">
          <a class="btn btn-primary lg" href="#routes" @click.prevent="go('routes')">先看看精选路线</a>
          <a class="btn ghost lg light" :href="enterHref">{{ loggedIn ? '进入控制台' : '登录后台' }}</a>
        </div>
      </div>
    </section>

    <footer class="home-footer">
      <div class="home-inner footer-inner">
        <span class="f-brand">PandaKing9 · 定制旅行协作平台</span>
        <span class="muted">专业川渝疆定制旅行 · 包车带司导</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.home { min-height: 100vh; background: var(--bg); color: var(--ink); }

/* 容器 */
.home-inner { max-width: var(--content-max, 1200px); margin: 0 auto; padding: 0 clamp(16px, 4vw, 32px); }

/* 顶部导航 */
.home-header {
  position: sticky; top: 0; z-index: 30;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: saturate(180%) blur(12px);
  border-bottom: 1px solid var(--line, #eef1f6);
}
.header-inner { display: flex; align-items: center; justify-content: space-between; height: var(--header-h, 58px); }
.brand { font-weight: 800; color: var(--brand); font-size: 19px; letter-spacing: -0.02em; cursor: pointer; }
.brand-sub { color: var(--muted); font-weight: 600; font-size: 13px; margin-left: 8px; }
.home-nav { display: flex; align-items: center; gap: 22px; }
.home-nav a { color: var(--ink-2); text-decoration: none; font-weight: 600; font-size: 15px; }
.home-nav a:hover { color: var(--brand); }

/* Hero */
.hero {
  position: relative; overflow: hidden;
  background: radial-gradient(1200px 500px at 80% -10%, rgba(200, 16, 46, 0.10), transparent 60%),
              linear-gradient(180deg, #fff 0%, var(--bg) 100%);
  padding: clamp(56px, 9vw, 110px) 0 clamp(40px, 6vw, 72px);
  text-align: center;
}
.eyebrow {
  display: inline-block; padding: 6px 14px; margin-bottom: 18px;
  background: var(--brand-50, #fdeef0); color: var(--brand-600, #a60d26);
  border-radius: 999px; font-weight: 700; font-size: 13px; letter-spacing: 0.02em;
}
.hero-title {
  margin: 0 auto; max-width: 18em;
  font-size: clamp(28px, 5.2vw, 50px); line-height: 1.18; font-weight: 800; letter-spacing: -0.02em;
}
.hero-sub {
  margin: 18px auto 0; max-width: 40em; color: var(--muted);
  font-size: clamp(15px, 1.8vw, 18px); line-height: 1.7;
}
.hero-cta { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-top: 30px; }
.hero-stats {
  display: flex; align-items: center; justify-content: center; gap: 18px;
  margin-top: 38px; color: var(--ink);
}
.hero-stats > div { display: flex; flex-direction: column; }
.hero-stats b { font-size: 26px; font-weight: 800; color: var(--brand); }
.hero-stats span { font-size: 13px; color: var(--muted); margin-top: 2px; }
.hero-stats .sep { width: 1px; height: 34px; background: var(--line, #e6eaf1); }

/* 通用按钮（复用全局 .btn / .btn-primary / .ghost） */
.btn.lg { padding: 13px 26px; font-size: 16px; }
.ghost {
  background: transparent; color: var(--brand); border: 1px solid var(--brand);
}
.ghost:hover { background: var(--brand-50, #fdeef0); }
.ghost.light { color: #fff; border-color: rgba(255, 255, 255, 0.7); }
.ghost.light:hover { background: rgba(255, 255, 255, 0.14); }

/* 区块标题 */
.section-head { text-align: center; max-width: 42em; margin: 0 auto clamp(28px, 4vw, 44px); }
.section-head h2 { font-size: clamp(24px, 3.6vw, 34px); font-weight: 800; letter-spacing: -0.02em; }
.section-head p { margin: 12px 0 0; color: var(--muted); font-size: 16px; line-height: 1.7; }

/* 路线网格 */
.routes { padding: clamp(48px, 7vw, 84px) 0; }
.route-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 22px; }
.route-card { overflow: hidden; padding: 0; transition: transform 0.22s, box-shadow 0.22s; }
.route-card:hover { transform: translateY(-4px); box-shadow: var(--sh-lg, 0 18px 40px rgba(18, 26, 41, 0.12)); }
.route-cover {
  position: relative; height: 158px; padding: 16px 18px;
  display: flex; align-items: flex-start; justify-content: space-between;
}
.route-region { color: #fff; font-weight: 800; font-size: 18px; text-shadow: 0 1px 6px rgba(0, 0, 0, 0.25); }
.route-days {
  color: #fff; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px;
  background: rgba(255, 255, 255, 0.22); backdrop-filter: blur(4px);
}
.cover-art { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 90px; }
.route-body { padding: 18px 18px 20px; }
.route-title { margin: 0 0 8px; font-size: 17px; font-weight: 700; line-height: 1.4; }
.route-summary { margin: 0 0 14px; color: var(--muted); font-size: 14px; line-height: 1.65; }
.route-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 7px; }
.route-list li {
  position: relative; padding-left: 18px; font-size: 13.5px; color: var(--ink-2); line-height: 1.5;
}
.route-list li::before { content: ''; position: absolute; left: 2px; top: 8px; width: 7px; height: 7px; border-radius: 50%; background: var(--brand); }
.route-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.badge {
  display: inline-block; padding: 5px 11px; font-size: 12.5px; font-weight: 600;
  color: var(--brand-600, #a60d26); background: var(--brand-50, #fdeef0); border-radius: 999px;
}

/* 为何选择 */
.about { padding: clamp(40px, 6vw, 72px) 0; background: var(--surface, #fff); }
.about-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
.about-item { padding: 24px; border: 1px solid var(--line, #eef1f6); border-radius: var(--r-lg, 16px); background: var(--bg); }
.about-ic { font-size: 30px; }
.about-item h4 { margin: 12px 0 6px; font-size: 17px; font-weight: 700; }
.about-item p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.65; }

/* 咨询 */
.consult {
  padding: clamp(48px, 7vw, 84px) 0;
  background: linear-gradient(135deg, var(--brand) 0%, var(--brand-600, #a60d26) 100%);
  color: #fff; text-align: center;
}
.consult-inner h2 { margin: 0; font-size: clamp(22px, 3.4vw, 32px); font-weight: 800; }
.consult-inner p { margin: 12px auto 0; max-width: 34em; color: rgba(255, 255, 255, 0.88); font-size: 16px; line-height: 1.7; }
.consult-cta { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-top: 26px; }
.consult .btn-primary { background: #fff; color: var(--brand); }
.consult .btn-primary:hover { background: #ffe9ec; }

/* 页脚 */
.home-footer { padding: 30px 0; border-top: 1px solid var(--line, #eef1f6); background: var(--surface, #fff); }
.footer-inner { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.f-brand { font-weight: 700; color: var(--ink); }
.muted { color: var(--muted); font-size: 13px; }

@media (max-width: 640px) {
  .home-nav { gap: 14px; }
  .home-nav a:not(.btn) { display: none; }
}
</style>
