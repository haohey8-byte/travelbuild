/* ============================================
   入境游定制协作工作台 · 交互原型 · 应用逻辑
   ============================================ */

/* ---- State ---- */
const state = {
  role: 'pandaking',        // pandaking | travel-agency | provincial | pdf
  view: 'routes',           // routes | cases | comm | knowledge | account
  routesSubview: 'kanban',  // routes 模块内部: 'kanban'(看板) | 'list'(列表) | 'detail'(详情)
  routesSource: 'kanban',   // 详情返回目标: 'kanban' | 'list' | 'menu'
  selectedCustomerId: 'C2026-001',
  selectedCarType: '7seat',
  filterStatus: 'all',
  filterAgency: 'all',
  filterMode: 'all',
  sortBy: 'urgency',
  pdfLang: 'zh',             // zh | th | bilingual
  editingDay: null,
  editingQuote: false,
  collaborationMode: false,  // 行程报价单是否在协作模式
  showCostInquiry: false,
  sidebarOpen: false,        // 移动端侧边栏开关
  iqTab: 'quote',             // 详情页 Tab: 'quote' (行程报价) | 'customer' (客户信息)
  iqFilterStatus: 'all',     // 列表筛选：状态
  iqSearch: '',              // 列表搜索关键词
  iqSelected: [],            // 列表多选：已选中的路线ID数组
  caseFilter: 'all',          // 案例展示筛选：主题
};

/* ---- Mobile detection ---- */
function isMobile() {
  return window.innerWidth <= 768 ||
    /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(navigator.userAgent);
}

/* ---- Utils ---- */
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => [...p.querySelectorAll(s)];
const fmt = (n) => '¥' + n.toLocaleString('zh-CN');

function showToast(icon, title, sub) {
  const root = $('#toast-root');
  root.innerHTML = `<div class="toast"><span class="toast-icon">${icon}</span><div class="toast-content"><div>${title}</div>${sub ? `<div class="toast-sub">${sub}</div>` : ''}</div></div>`;
  setTimeout(() => { root.innerHTML = ''; }, 3500);
}

function showModal(title, bodyHtml, footerHtml) {
  $('#modal-root').innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal">
        <div class="modal-header"><span class="modal-title">${title}</span><button class="btn-ghost btn-icon" onclick="closeModal()">✕</button></div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    </div>`;
}
function closeModal() { $('#modal-root').innerHTML = ''; }

function calcQuote(carTypeKey) {
  const q = MOCK_DATA.quote;
  let costSubtotal = 0;
  q.items.forEach(item => { costSubtotal += (item.costs[carTypeKey] || 0); });
  let profit, agencyQuote;
  if (q.priceMode === 'bundled') {
    // 模式B：含利润直接报价 —— ③由用户直接录入，②反算
    agencyQuote = q.bundledPrice[carTypeKey] || 0;
    profit = agencyQuote - costSubtotal;
  } else {
    // 模式A：成本+利润分解 —— ②由用户设置，③推导
    profit = q.profit.mode === 'amount' ? q.profit.value : Math.round(costSubtotal * q.profit.value / 100);
    agencyQuote = costSubtotal + profit;
  }
  const markup = q.agencyMarkup.mode === 'amount' ? q.agencyMarkup.value : Math.round(agencyQuote * q.agencyMarkup.value / 100);
  const touristQuote = agencyQuote + markup;
  return { costSubtotal, profit, agencyQuote, markup, touristQuote, loss: profit < 0 };
}

/* ---- 自动保存（Q1.1/1.2）：编辑即存草稿，轻量提示 ---- */
let _autoSaveTimer = null;
function markAutoSaved() {
  const it = MOCK_DATA.itinerary;
  it.draft = true; // 标记草稿态（未通知）
  if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    showToast('✅', '已自动保存 · 刚刚', '草稿已保存（仅你可见，保存并通知后才对协作方发布）');
  }, 120);
}

/* ---- 行程↔报价联动（Q2.1/2.2）：按量项自动调量 ---- */
function recalcQuantityItems() {
  const it = MOCK_DATA.itinerary;
  const q = MOCK_DATA.quote;
  const days = it.days.length;
  const hotelNights = it.days.filter(d => d.hotel && d.hotel.trim()).length;
  const car = q.items.find(i => i.key === 'car');
  if (car) {
    const newLabel = `包车（${days}天）`;
    if (car.label !== newLabel) { car.label = newLabel; car.unit = `${days}天`; car.needsUpdate = true; }
  }
  const hotel = q.items.find(i => i.key === 'hotel');
  if (hotel) {
    const newLabel = `酒店（${hotelNights}晚）`;
    if (hotel.label !== newLabel) { hotel.label = newLabel; hotel.unit = `${hotelNights}晚`; hotel.needsUpdate = true; }
  }
}

/* ---- 利润模式切换（Q7.1） ---- */
function setPriceMode(mode) {
  MOCK_DATA.quote.priceMode = mode;
  renderItineraryQuote();
  showToast('🔄', `利润模式：${mode === 'bundled' ? '含利润直接报价（B）' : '成本+利润分解（A）'}`,
    mode === 'bundled' ? '直接录入对一手报价，利润自动反算' : '录入成本价+利润，自动推导对一手报价');
}

/* ---- 模式B：录入③对一手报价（含利润） ---- */
function setBundledPrice(val) {
  const v = parseInt(val);
  if (isNaN(v) || v < 0) { showToast('⚠️', '报价不能为负数', ''); renderItineraryQuote(); return; }
  MOCK_DATA.quote.bundledPrice[state.selectedCarType] = v;
  markAutoSaved();
  renderItineraryQuote();
}

/* ---- 采纳省地接社成本价回填①（Q6.2） ---- */
function adoptProvincialCost() {
  const q = MOCK_DATA.quote;
  const mock = {
    hotel: { '7seat': 6000, '9seat': 6000, '14seat': 6000 },
    car: { '7seat': 15000, '9seat': 17000, '14seat': 20000 },
    tickets: { '7seat': 3000, '9seat': 3000, '14seat': 3000 },
    service: { '7seat': 2000, '9seat': 2000, '14seat': 2000 },
    experience: { '7seat': 0, '9seat': 0, '14seat': 0 },
  };
  q.items.forEach(i => { if (mock[i.key]) { i.costs = { ...mock[i.key] }; i.needsUpdate = false; } });
  closeModal();
  showToast('✅', '已采纳省地接社成本价', '①成本价已回填，可继续设置利润');
  renderItineraryQuote();
}

/* ---- 标记报价行已复核（Q2.4）：清除需更新 ---- */
function clearItemNeedsUpdate(key) {
  const item = MOCK_DATA.quote.items.find(i => i.key === key);
  if (item) { item.needsUpdate = false; renderItineraryQuote(); }
}
function clearAllNeedsUpdate() {
  MOCK_DATA.quote.items.forEach(i => { i.needsUpdate = false; });
  showToast('✅', '已全部标记已复核', '标红的报价行已清除"需更新"');
  renderItineraryQuote();
}

function getRoute(id) { return MOCK_DATA.routes.find(r => r.id === id); }
function getCustomer(id) { return MOCK_DATA.customers.find(c => c.id === id); }

/* ---- Router ---- */
function navigate(view, params = {}) {
  state.view = view;
  if (params.customerId) state.selectedCustomerId = params.customerId;
  if (params.role) state.role = params.role;
  state.sidebarOpen = false; // 导航后关闭侧边栏

  // 路线管理模块进入路径（看板/列表/详情 三态）
  if (view === 'routes') {
    if (params.customerId) {
      // 从看板/列表卡片进入 → 直达详情
      state.routesSubview = 'detail';
      state.routesSource = params.source || 'kanban';
    } else {
      // 从菜单进入 → 默认看板视图
      state.routesSubview = params.subview || 'kanban';
      state.routesSource = 'menu';
    }
    if (params.tab) state.iqTab = params.tab;
    else state.iqTab = 'quote';
  }

  render();
}

function switchRole(role) {
  state.role = role;
  if (role === 'travel-agency' || role === 'provincial' || role === 'pdf') {
    state.view = 'h5';
  } else {
    state.view = 'routes';
  }
  render();
}

/* ---- 路线管理模块：看板 / 列表 视图切换 ---- */
function routeViewToggle() {
  return `
    <div class="route-view-toggle">
      <button class="${state.routesSubview === 'kanban' ? 'active' : ''}" onclick="setRouteSubview('kanban')">🗺️ 看板视图</button>
      <button class="${state.routesSubview === 'list' ? 'active' : ''}" onclick="setRouteSubview('list')">📋 列表视图</button>
    </div>`;
}
function setRouteSubview(v) {
  state.routesSubview = v;
  state.routesSource = 'menu';
  render();
}

function toggleSidebar(force) {
  state.sidebarOpen = force !== undefined ? force : !state.sidebarOpen;
  const sidebar = $('#sidebar');
  const overlay = $('#sidebarOverlay');
  if (sidebar) sidebar.classList.toggle('open', state.sidebarOpen);
  if (overlay) overlay.classList.toggle('show', state.sidebarOpen);
}

function selectIQRoute(routeId) {
  state.selectedCustomerId = routeId;
  state.routesSubview = 'detail';
  state.routesSource = 'list';
  render();
}

function backToRoutes() {
  state.routesSubview = state.routesSource === 'menu' ? 'kanban' : state.routesSource;
  render();
}

/* ---- 列表选择 / 删除 ---- */
function toggleSelectRoute(routeId) {
  const idx = state.iqSelected.indexOf(routeId);
  if (idx >= 0) state.iqSelected.splice(idx, 1);
  else state.iqSelected.push(routeId);
  renderItineraryQuoteList();
}

function selectAllRoutes(checked, ids) {
  if (checked) {
    // 合并当前筛选结果，避免重复
    ids.forEach(id => { if (!state.iqSelected.includes(id)) state.iqSelected.push(id); });
  } else {
    // 从选中集合移除当前筛选结果
    state.iqSelected = state.iqSelected.filter(id => !ids.includes(id));
  }
  renderItineraryQuoteList();
}

function clearRouteSelection() {
  state.iqSelected = [];
  renderItineraryQuoteList();
}

// 从 routes + customers 同时删除（1:1 关系）
function removeRouteAndCustomer(ids) {
  const idSet = new Set(ids);
  MOCK_DATA.routes = MOCK_DATA.routes.filter(r => !idSet.has(r.id));
  MOCK_DATA.customers = MOCK_DATA.customers.filter(c => !idSet.has(c.id));
}

function confirmDeleteRoutes(ids) {
  const list = MOCK_DATA.routes.filter(r => ids.includes(r.id));
  const names = list.map(r => `${r.customer}（${r.destination}）`).join('、');
  showModal('确认删除路线', `
    <div class="confirm-warn">
      <span class="confirm-warn-icon">⚠️</span>
      <div>即将删除 <strong>${ids.length}</strong> 条路线及其关联的客户档案，删除后不可恢复：</div>
    </div>
    <div class="confirm-list">${names}</div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" onclick="doDeleteRoutes(${JSON.stringify(ids)})">确认删除</button>
  `);
}

function doDeleteRoutes(ids) {
  removeRouteAndCustomer(ids);
  state.iqSelected = [];
  closeModal();
  showToast('🗑️', `已删除 ${ids.length} 条路线`, '关联的路线与客户档案已一并移除');
  // 若当前详情页正好是已删除的路线，退回列表
  if (ids.includes(state.selectedCustomerId)) { state.routesSubview = 'list'; }
  render();
}

// 客户信息 Tab 单条删除
function confirmDeleteCustomer(routeId) {
  const r = getRoute(routeId) || {};
  showModal('确认删除客户', `
    <div class="confirm-warn">
      <span class="confirm-warn-icon">⚠️</span>
      <div>即将删除客户 <strong>${r.customer || ''}</strong>（${r.destination || ''}）及其路线档案，删除后不可恢复。</div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" onclick="doDeleteCustomer('${routeId}')">确认删除</button>
  `);
}

function doDeleteCustomer(routeId) {
  removeRouteAndCustomer([routeId]);
  state.iqSelected = state.iqSelected.filter(id => id !== routeId);
  closeModal();
  showToast('🗑️', '客户已删除', '路线档案已一并移除');
  state.routesSubview = 'list';
  render();
}

/* ---- Main Render ---- */
function render() {
  const app = $('#app');

  if (state.role === 'travel-agency') {
    app.innerHTML = renderH5Shell('travel-agency');
    renderH5TravelAgency();
    return;
  }
  if (state.role === 'provincial') {
    app.innerHTML = renderH5Shell('provincial');
    renderH5Provincial();
    return;
  }
  if (state.role === 'pdf') {
    app.innerHTML = renderPDFShell();
    renderPDFPreview();
    return;
  }

  // Desktop shell (PandaKing)
  app.innerHTML = renderDesktopShell();
  attachDesktopNav();
  const content = $('#content');
  switch (state.view) {
    case 'routes':
      if (state.routesSubview === 'kanban') renderRouteKanban();
      else if (state.routesSubview === 'list') renderItineraryQuoteList();
      else renderItineraryQuote();
      break;
    case 'cases': renderCases(); break;
    case 'knowledge': renderKnowledgeBase(); break;
    case 'account': renderAccountManagement(); break;
    default: renderRouteKanban();
  }
}

/* ---- Desktop Shell ---- */
function renderDesktopShell() {
  const navItems = [
    { key: 'routes', icon: '🗺️', label: '路线管理', badge: MOCK_DATA.stats.overdue },
    { key: 'cases', icon: '🌟', label: '案例展示' },
    { key: 'knowledge', icon: '📚', label: '知识库' },
    { key: 'account', icon: '⚙️', label: '账号管理' },
  ];
  return `
    <div class="app">
      <div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar(false)"></div>
      <aside class="sidebar ${state.sidebarOpen ? 'open' : ''}" id="sidebar">
        <div class="sidebar-logo">
          <div class="logo-icon">🧳</div>
          <span>PandaKing 工作台</span>
        </div>
        <nav class="sidebar-nav">
          ${navItems.map(item => `
            <div class="nav-item ${state.view === item.key ? 'active' : ''}" onclick="navigate('${item.key}')">
              <span class="icon">${item.icon}</span>
              <span>${item.label}</span>
              ${item.badge ? `<span class="badge-count">${item.badge}</span>` : ''}
            </div>
          `).join('')}
        </nav>
        <div class="sidebar-footer">
          <div>v0.9.8 原型 · 2026-07</div>
          <div style="margin-top:4px">入境游定制协作工作台</div>
        </div>
      </aside>
      <div class="main-area">
        <header class="topbar">
          <div class="mobile-menu-btn" onclick="toggleSidebar()">☰</div>
          <div class="topbar-title">${getViewTitle()}</div>
          <div class="topbar-actions">
            <div class="role-switcher">
              <button class="${state.role === 'pandaking' ? 'active' : ''}" onclick="switchRole('pandaking')">一手地接社</button>
              <button class="${state.role === 'travel-agency' ? 'active' : ''}" onclick="switchRole('travel-agency')">旅行社·H5</button>
              <button class="${state.role === 'provincial' ? 'active' : ''}" onclick="switchRole('provincial')">省地接社·H5</button>
              <button class="${state.role === 'pdf' ? 'active' : ''}" onclick="switchRole('pdf')">PDF</button>
            </div>
            <div class="topbar-user">
              <div class="user-avatar">${MOCK_DATA.currentUser.avatar}</div>
              <div>
                <div class="user-name">${MOCK_DATA.currentUser.name}</div>
                <div class="user-role">${MOCK_DATA.currentUser.role}</div>
              </div>
            </div>
          </div>
        </header>
        <main class="content" id="content"></main>
      </div>
      <nav class="mobile-nav">
        ${navItems.map(item => `
          <div class="mobile-nav-item ${state.view === item.key ? 'active' : ''}" onclick="navigate('${item.key}')">
            <span class="nav-icon">${item.icon}</span>
            <span class="nav-label">${item.label.length > 4 ? item.label.slice(0,4) : item.label}</span>
          </div>
        `).join('')}
      </nav>
    </div>`;
}

function getViewTitle() {
  const titles = {
    routes: '路线管理', cases: '案例展示',
    knowledge: '知识库', account: '账号管理',
  };
  return titles[state.view] || '';
}

function attachDesktopNav() { /* nav items use inline onclick */ }

/* ============================================
   View: 多路线管理看板 (Dashboard)
   ============================================ */
function renderRouteKanban() {
  const content = $('#content');
  let routes = [...MOCK_DATA.routes];

  // Filter
  if (state.filterStatus !== 'all') routes = routes.filter(r => r.statusKey === state.filterStatus);
  if (state.filterAgency !== 'all') routes = routes.filter(r => r.agency === state.filterAgency);
  if (state.filterMode !== 'all') routes = routes.filter(r => r.modeKey === state.filterMode);

  // Sort
  if (state.sortBy === 'urgency') {
    const order = { danger: 0, warning: 1, normal: 2, lost: 3 };
    routes.sort((a, b) => (order[a.urgent] || 9) - (order[b.urgent] || 9) || a.lastActionHours - b.lastActionHours);
  } else if (state.sortBy === 'time') {
    routes.sort((a, b) => b.lastActionHours - a.lastActionHours);
  }

  const urgentClass = (r) => r.urgent === 'danger' ? 'urgent' : r.urgent === 'warning' ? 'warning' : r.urgent === 'lost' ? '' : '';
  const urgencyIcon = (r) => r.urgent === 'danger' ? '🔴' : r.urgent === 'warning' ? '🟡' : r.urgent === 'lost' ? '⚪' : '🟢';

  content.innerHTML = `
    <div class="notice-banner">
      <span>⚠️</span>
      <span><strong>${MOCK_DATA.stats.overdue}条路线超时待处理</strong> — John Smith（超时3天·待你修改行程）、Maria Garcia（超时1天·待省地接社回复成本）</span>
    </div>

    ${routeViewToggle()}

    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-label">在跟进路线</div>
        <div class="stat-value">${MOCK_DATA.stats.totalRoutes}</div>
        <div class="stat-trend up">↑ 本周新增3条</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">本月成单</div>
        <div class="stat-value">${MOCK_DATA.stats.monthlyOrders}</div>
        <div class="stat-trend up">↑ 较上月+15%</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">平均成单周期</div>
        <div class="stat-value">${MOCK_DATA.stats.avgCycleDays}<span style="font-size:14px">天</span></div>
        <div class="stat-trend up">↓ 较基线-1.8天</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">H5链接打开率</div>
        <div class="stat-value">${MOCK_DATA.stats.h5OpenRate}</div>
        <div class="stat-trend up">↑ 超过目标80%</div>
      </div>
    </div>

    <div class="dash-toolbar">
      <button class="btn btn-primary" onclick="openNewCustomerModal()">⊕ 新建客户</button>
      <div class="filter-group">
        <select class="filter-select ${state.filterStatus !== 'all' ? 'active' : ''}" onchange="state.filterStatus=this.value;renderRouteKanban()">
          <option value="all" ${state.filterStatus==='all'?'selected':''}>全部状态</option>
          <option value="awaiting_quote" ${state.filterStatus==='awaiting_quote'?'selected':''}>待报价</option>
          <option value="awaiting_feedback" ${state.filterStatus==='awaiting_feedback'?'selected':''}>待反馈</option>
          <option value="await_primary_confirm" ${state.filterStatus==='await_primary_confirm'?'selected':''}>待一手确认</option>
          <option value="await_agency_revision" ${state.filterStatus==='await_agency_revision'?'selected':''}>待旅行社修订</option>
          <option value="awaiting_confirm" ${state.filterStatus==='awaiting_confirm'?'selected':''}>待确认</option>
          <option value="confirmed" ${state.filterStatus==='confirmed'?'selected':''}>已确认</option>
          <option value="lost" ${state.filterStatus==='lost'?'selected':''}>已流失</option>
        </select>
        <select class="filter-select ${state.filterAgency !== 'all' ? 'active' : ''}" onchange="state.filterAgency=this.value;renderRouteKanban()">
          <option value="all">全部旅行社</option>
          ${[...new Set(MOCK_DATA.routes.map(r=>r.agency))].map(a=>`<option value="${a}" ${state.filterAgency===a?'selected':''}>${a}</option>`).join('')}
        </select>
        <select class="filter-select ${state.filterMode !== 'all' ? 'active' : ''}" onchange="state.filterMode=this.value;renderRouteKanban()">
          <option value="all">全部模式</option>
          <option value="self" ${state.filterMode==='self'?'selected':''}>自行模式</option>
          <option value="collab" ${state.filterMode==='collab'?'selected':''}>协作模式</option>
        </select>
      </div>
      <select class="filter-select" onchange="state.sortBy=this.value;renderRouteKanban()">
        <option value="urgency" ${state.sortBy==='urgency'?'selected':''}>按紧急度排序</option>
        <option value="time" ${state.sortBy==='time'?'selected':''}>按最后操作时间</option>
      </select>
      <div style="flex:1"></div>
      <input class="filter-select" placeholder="🔍 搜索客户名/目的地..." style="width:200px" oninput="filterRoutes(this.value)">
    </div>

    <div class="route-grid" id="routeGrid">
      ${routes.map(r => `
        <div class="route-card ${urgentClass(r)}" onclick="navigate('routes',{customerId:'${r.id}',source:'kanban'})">
          <div class="route-card-header">
            <div>
              <div class="route-card-name">${urgencyIcon(r)} ${r.customer}</div>
              <div class="route-card-agency">${r.agency} · ${r.mode}</div>
            </div>
            <span class="badge ${r.statusKey==='confirmed'?'badge-success':r.statusKey==='lost'?'badge-gray':r.urgent==='danger'?'badge-danger':'badge-warning'}">${r.status}</span>
          </div>
          <div class="route-card-route">${r.destination} · ${r.groupSize}人 · ${r.travelDate}</div>
          <div class="route-card-meta">
            <span class="tag">${r.version}</span>
            ${r.todo ? `<span class="route-card-todo">⚠ ${r.todo}</span>` : '<span class="badge badge-success">✓ 无待办</span>'}
          </div>
          <div class="route-card-footer">
            <span>最后操作: ${r.lastAction}</span>
            <span>进入 →</span>
          </div>
        </div>
      `).join('')}
    </div>

    <div class="dash-summary">
      <div class="stat"><span class="stat-num">${MOCK_DATA.routes.length}</span> 条路线</div>
      <div class="stat">待报价: <span class="stat-num" style="color:var(--warning)">${MOCK_DATA.stats.awaitingQuote}</span></div>
      <div class="stat">待反馈: <span class="stat-num" style="color:var(--danger)">${MOCK_DATA.stats.awaitingFeedback}</span></div>
      <div class="stat">待一手确认: <span class="stat-num" style="color:var(--brand)">${MOCK_DATA.stats.awaitPrimaryConfirm}</span></div>
      <div class="stat">待旅行社修订: <span class="stat-num" style="color:var(--warning)">${MOCK_DATA.stats.awaitAgencyRevision}</span></div>
      <div class="stat">待确认: <span class="stat-num" style="color:var(--info)">${MOCK_DATA.stats.awaitingConfirm}</span></div>
      <div class="stat">已确认: <span class="stat-num" style="color:var(--success)">${MOCK_DATA.stats.confirmed}</span></div>
      <div class="stat">已流失: <span class="stat-num" style="color:var(--text-3)">${MOCK_DATA.stats.lost}</span></div>
    </div>
  `;
}

function filterRoutes(query) {
  if (!query) { renderRouteKanban(); return; }
  const q = query.toLowerCase();
  const grid = $('#routeGrid');
  const filtered = MOCK_DATA.routes.filter(r =>
    r.customer.toLowerCase().includes(q) || r.destination.toLowerCase().includes(q) || r.agency.includes(q)
  );
  const urgentClass = (r) => r.urgent === 'danger' ? 'urgent' : r.urgent === 'warning' ? 'warning' : '';
  const urgencyIcon = (r) => r.urgent === 'danger' ? '🔴' : r.urgent === 'warning' ? '🟡' : r.urgent === 'lost' ? '⚪' : '🟢';
  grid.innerHTML = filtered.map(r => `
    <div class="route-card ${urgentClass(r)}" onclick="navigate('routes',{customerId:'${r.id}',source:'kanban'})">
      <div class="route-card-header">
        <div><div class="route-card-name">${urgencyIcon(r)} ${r.customer}</div><div class="route-card-agency">${r.agency} · ${r.mode}</div></div>
        <span class="badge ${r.statusKey==='confirmed'?'badge-success':r.statusKey==='lost'?'badge-gray':'badge-warning'}">${r.status}</span>
      </div>
      <div class="route-card-route">${r.destination} · ${r.groupSize}人</div>
      <div class="route-card-meta"><span class="tag">${r.version}</span>${r.todo?`<span class="route-card-todo">⚠ ${r.todo}</span>`:'<span class="badge badge-success">✓ 无待办</span>'}</div>
      <div class="route-card-footer"><span>最后操作: ${r.lastAction}</span><span>进入 →</span></div>
    </div>
  `).join('') || '<div class="empty-state"><div class="icon">🔍</div>未找到匹配路线</div>';
}

function openNewCustomerModal() {
  showModal('新建客户档案', `
    <div class="form-row">
      <div class="form-group"><label class="form-label">英文姓名 *</label><input class="form-input" placeholder="如 John Smith"></div>
      <div class="form-group"><label class="form-label">中文姓名</label><input class="form-input" placeholder="如 约翰·史密斯"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">国家/地区 *</label><select class="form-select"><option>美国</option><option>泰国</option><option>韩国</option><option>日本</option><option>英国</option></select></div>
      <div class="form-group"><label class="form-label">出行人数 *</label><input class="form-input" type="number" value="5"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">出行时间 *</label><input class="form-input" type="date" value="2026-07-20"></div>
      <div class="form-group"><label class="form-label">目的地 *</label><input class="form-input" placeholder="如 四川·九寨沟" value="四川·九寨沟"></div>
    </div>
    <div class="form-group"><label class="form-label">联系方式 *</label><input class="form-input" placeholder="微信号/邮箱"></div>
    <div class="form-group">
      <label class="form-label">行程规划草案（旅行社发起 ★ v0.9.10）</label>
      <div class="draft-budget-row">
        <input class="form-input" type="number" placeholder="预算区间/人（¥）" style="width:150px">
        <select class="form-select" style="width:120px"><option>五星级</option><option>四星级</option><option>民宿</option><option>不限</option></select>
      </div>
      <div class="draft-days">
        <div class="draft-day"><span class="draft-day-tag">D1</span><input class="form-input" placeholder="城市/景点/活动，如 抵达成都·宽窄巷子"></div>
        <div class="draft-day"><span class="draft-day-tag">D2</span><input class="form-input" placeholder="如 成都→九寨沟·沿途观光"></div>
      </div>
      <button class="day-add-btn" onclick="showToast('➕','已添加一天','行程规划草案：按天搭建结构化行程框架（城市/景点/活动/住宿偏好）')">＋ 添加一天</button>
      <div class="text-muted" style="font-size:12px;margin-top:4px">草案提交后路线进入「待一手确认」，一手可确认采用或回传修改反馈（v0.9.10 双向协作）</div>
    </div>
    <div class="notice-banner info"><span>ℹ️</span><span>来源旅行社自动归属为当前登录账号所属旅行社；关联一手地接社运营由系统自动匹配</span></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="closeModal();showToast('✅','客户档案已创建','客户编号 C2026-009 已生成')">创建客户</button>`);
}

/* ============================================
   View: 行程报价单 (Itinerary-Quote)
   ============================================ */

function renderItineraryQuoteList() {
  const content = $('#content');
  const routes = MOCK_DATA.routes;

  // 筛选 + 搜索
  let filtered = routes;
  if (state.iqFilterStatus !== 'all') {
    filtered = filtered.filter(r => r.statusKey === state.iqFilterStatus);
  }
  if (state.iqSearch) {
    const q = state.iqSearch.toLowerCase();
    filtered = filtered.filter(r =>
      r.customer.toLowerCase().includes(q) ||
      r.customerCn.toLowerCase().includes(q) ||
      r.destination.toLowerCase().includes(q) ||
      r.agency.toLowerCase().includes(q)
    );
  }

  // 紧急度排序
  const urgencyOrder = { danger: 0, warning: 1, normal: 2, lost: 3 };
  filtered.sort((a, b) => (urgencyOrder[a.urgent] || 9) - (urgencyOrder[b.urgent] || 9));

  const statusFilters = [
    { key: 'all', label: '全部', count: routes.length },
    { key: 'await_primary_confirm', label: '待一手确认', count: routes.filter(r => r.statusKey === 'await_primary_confirm').length },
    { key: 'await_agency_revision', label: '待旅行社修订', count: routes.filter(r => r.statusKey === 'await_agency_revision').length },
    { key: 'awaiting_quote', label: '待报价', count: routes.filter(r => r.statusKey === 'awaiting_quote').length },
    { key: 'awaiting_feedback', label: '待反馈', count: routes.filter(r => r.statusKey === 'awaiting_feedback').length },
    { key: 'awaiting_confirm', label: '待确认', count: routes.filter(r => r.statusKey === 'awaiting_confirm').length },
    { key: 'confirmed', label: '已确认', count: routes.filter(r => r.statusKey === 'confirmed').length },
    { key: 'lost', label: '已流失', count: routes.filter(r => r.statusKey === 'lost').length },
  ];

  const urgencyColors = {
    danger: 'var(--danger)',
    warning: 'var(--warning)',
    normal: 'var(--success)',
    lost: 'var(--text-3)',
  };

  const allFilteredIds = filtered.map(r => r.id);
  const selectedInView = allFilteredIds.filter(id => state.iqSelected.includes(id));
  const allSelected = allFilteredIds.length > 0 && selectedInView.length === allFilteredIds.length;

  content.innerHTML = `
    <div class="iq-list-view">
      ${routeViewToggle()}
      <div class="iq-list-toolbar">
        <div class="iq-list-search-wrap">
          <input class="iq-list-search" placeholder="搜索客户名 / 路线 / 旅行社..." value="${state.iqSearch}"
            oninput="state.iqSearch=this.value;renderItineraryQuoteList();this.focus()">
        </div>
        <div class="iq-list-filters">
          ${statusFilters.map(f => `
            <button class="filter-select ${state.iqFilterStatus === f.key ? 'active' : ''}"
              onclick="state.iqFilterStatus='${f.key}';renderItineraryQuoteList()">
              ${f.label}${f.count > 0 ? ` (${f.count})` : ''}
            </button>
          `).join('')}
        </div>
        <div class="iq-list-toolbar-right">
          <label class="select-all">
            <input type="checkbox" ${allSelected ? 'checked' : ''}
              onchange="selectAllRoutes(this.checked, ${JSON.stringify(allFilteredIds)})"> 全选
          </label>
          <button class="btn btn-primary btn-sm" onclick="openNewCustomerModal()" style="white-space:nowrap">⊕ 新建客户</button>
        </div>
      </div>

      ${state.iqSelected.length > 0 ? `
      <div class="batch-bar">
        <span class="batch-count">已选 <strong>${state.iqSelected.length}</strong> 项</span>
        <div class="batch-actions">
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteRoutes(${JSON.stringify(state.iqSelected)})">🗑️ 批量删除</button>
          <button class="btn btn-ghost btn-sm" onclick="clearRouteSelection()">取消选择</button>
        </div>
      </div>
      ` : ''}

      <div class="iq-list-summary">
        共 ${filtered.length} 条路线
        ${filtered.some(r => r.todo) ? `，其中 ${filtered.filter(r => r.todo).length} 条有待办` : ''}
      </div>

      ${filtered.length === 0 ? `
        <div class="empty-state">
          <div class="icon">📋</div>
          <div>没有匹配的路线</div>
        </div>
      ` : `
        <div class="iq-list-items">
          ${filtered.map(r => {
            const c = getCustomer(r.id) || {};
            const isSel = state.iqSelected.includes(r.id);
            return `
            <div class="iq-list-card ${r.urgent === 'danger' ? 'urgent' : r.urgent === 'warning' ? 'warning' : ''} ${isSel ? 'selected' : ''}"
              onclick="selectIQRoute('${r.id}')">
              <div class="iq-list-card-bar" style="background:${urgencyColors[r.urgent] || 'var(--border)'}"></div>
              <label class="iq-list-check" onclick="event.stopPropagation()">
                <input type="checkbox" ${isSel ? 'checked' : ''} onchange="toggleSelectRoute('${r.id}')">
              </label>
              <button class="iq-list-del" title="删除此路线" onclick="event.stopPropagation();confirmDeleteRoutes(['${r.id}'])">🗑️</button>
              <div class="iq-list-card-body">
                <div class="iq-list-card-top">
                  <div class="iq-list-card-name">${r.customer} <span style="color:var(--text-3);font-weight:400">${r.customerCn || ''}</span></div>
                  <div class="iq-list-card-version">${r.version}</div>
                </div>
                <div class="iq-list-card-route">${r.destination}</div>
                <div class="iq-list-card-meta">
                  <span class="text-muted">${c.country || ''}</span>
                  <span class="text-muted">·</span>
                  <span class="text-muted">${r.agency}</span>
                  <span class="text-muted">·</span>
                  <span class="text-muted">${r.groupSize}人</span>
                  <span class="text-muted">·</span>
                  <span class="text-muted">${r.travelDate}出行</span>
                  <span class="text-muted">·</span>
                  <span class="text-muted">${r.lastAction}</span>
                </div>
                <div class="iq-list-card-tags">
                  <span class="badge ${r.statusKey === 'confirmed' ? 'badge-success' : r.statusKey === 'lost' ? 'badge-gray' : 'badge-warning'}">${r.status}</span>
                  <span class="badge ${r.modeKey === 'collab' ? 'badge-purple' : 'badge-brand'}">${r.mode}</span>
                  ${c.hasInitialPlan ? '<span class="badge badge-info">有行程草案</span>' : ''}
                  ${r.todo ? `<span class="badge badge-danger">⚠ ${r.todo}</span>` : ''}
                </div>
                <div class="iq-list-card-enter">进入 →</div>
              </div>
            </div>
            `;
          }).join('')}
        </div>
      `}
    </div>
  `;
}

function renderItineraryQuote() {
  const content = $('#content');
  const route = getRoute(state.selectedCustomerId) || MOCK_DATA.routes[0];
  const itinerary = MOCK_DATA.itinerary;
  const q = MOCK_DATA.quote;
  const carType = q.carTypes.find(c => c.key === state.selectedCarType);
  const calc = calcQuote(state.selectedCarType);
  const needsUpdateCount = q.items.filter(i => i.needsUpdate).length;

  content.innerHTML = `
    <div class="iq-header">
      <div class="iq-header-left">
        <button class="btn btn-ghost btn-sm" onclick="backToRoutes()">← ${state.routesSource === 'list' ? '返回列表' : '返回看板'}</button>
        <div>
          <div class="iq-customer-name">${route.customer} · ${route.destination}</div>
          <div class="iq-route-name">${route.agency} · ${route.groupSize}人 · ${route.travelDate}出行 · ${route.mode}</div>
        </div>
      </div>
      <div class="iq-header-right">
        <span class="badge ${route.modeKey === 'collab' ? 'badge-purple' : 'badge-brand'}">${route.mode}</span>
        <span class="iq-version">${itinerary.version} · ${itinerary.draft ? '<span class="draft-badge">草稿·未通知</span>' : '已发布'}</span>
        ${state.role === 'pandaking' && route.statusKey === 'await_primary_confirm' ? `
          <button class="btn btn-success btn-sm" onclick="route.statusKey='awaiting_quote';route.status='待报价';showToast('✅','已确认采用','草案转正为行程报价单，路线转为待报价');renderItineraryQuote()">✓ 确认采用</button>
          <button class="btn btn-warning btn-sm" onclick="route.statusKey='await_agency_revision';route.status='待旅行社修订';showToast('↩️','已回传修改反馈','路线转为待旅行社修订，旅行社可在H5查看修改意见');renderItineraryQuote()">↩ 回传修改反馈</button>
        ` : ''}
      </div>
    </div>

    ${needsUpdateCount > 0 ? `<div class="notice-banner"><span>⚠️</span><span>报价区块有 <strong>${needsUpdateCount}项需更新</strong>（行程已变更但报价未同步），请处理后保存</span></div>` : ''}

    <div class="iq-tab-bar">
      <button class="iq-tab ${state.iqTab === 'quote' ? 'active' : ''}" onclick="switchIQTab('quote')">
        📅 行程报价
      </button>
      <button class="iq-tab ${state.iqTab === 'customer' ? 'active' : ''}" onclick="switchIQTab('customer')">
        👤 客户信息
      </button>
      <button class="iq-tab ${state.iqTab === 'comm' ? 'active' : ''}" onclick="switchIQTab('comm')">
        💬 沟通时间线
      </button>
    </div>

    ${state.iqTab === 'quote' ? `
    <div class="iq-body">
      <!-- 行程区块 -->
      <div class="iq-section">
        <div class="iq-section-header">
          <div class="iq-section-title">📅 行程区块</div>
          <button class="btn btn-ghost btn-sm" onclick="addDay()">＋ 添加一天</button>
        </div>
        <div class="iq-section-body">
          ${itinerary.days.map(day => `
            <div class="day-card ${day.hasFeedback ? 'has-feedback' : ''}" id="day-${day.day}">
              <div class="day-card-header">
                <div>
                  <span class="day-card-day">Day ${day.day}</span>
                  <span style="color:var(--text-3);margin-left:8px">${day.date} · ${day.city}</span>
                </div>
                <div style="display:flex;gap:4px">
                  ${day.hasFeedback ? `<span class="day-feedback-marker" onclick="showFeedback('${day.day}','${day.feedbackContent}')">📝 有反馈</span>` : ''}
                  <button class="btn btn-ghost btn-sm" onclick="toggleEditDay(${day.day})">✏️</button>
                  <button class="btn btn-ghost btn-sm btn-del" onclick="confirmDeleteDay(${day.day})">🗑️</button>
                </div>
              </div>
              <div class="day-card-body">
                <div class="day-field"><span class="day-field-label">住宿</span><span class="day-field-value editable" contenteditable="true" onblur="saveDayField(${day.day},'hotel',this)">${day.hotel || '—'}</span></div>
                <div class="day-field"><span class="day-field-label">景点</span><span class="day-field-value editable" contenteditable="true" onblur="saveDayField(${day.day},'attractions',this)">${day.attractions}</span></div>
                <div class="day-field"><span class="day-field-label">用餐</span><span class="day-field-value editable" contenteditable="true" onblur="saveDayField(${day.day},'meals',this)">${day.meals}</span></div>
                <div class="day-field"><span class="day-field-label">交通</span><span class="day-field-value editable" contenteditable="true" onblur="saveDayField(${day.day},'transport',this)">${day.transport}</span></div>
              </div>
            </div>
          `).join('')}
          <button class="day-add-btn" onclick="addDay()">＋ 添加一天（Day ${itinerary.days.length + 1}）</button>
        </div>
      </div>

      <!-- 报价区块 -->
      <div class="iq-section">
        <div class="iq-section-header">
          <div class="iq-section-title">💰 报价区块 ${needsUpdateCount > 0 ? `<span class="badge badge-danger">⚠ ${needsUpdateCount}项需更新</span>` : ''}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${needsUpdateCount > 0 ? `<button class="btn btn-secondary btn-sm" onclick="clearAllNeedsUpdate()">✓ 全部标记已复核</button>` : ''}
            <button class="btn btn-primary btn-sm" onclick="addQuoteItem()">＋ 新增报价项</button>
            ${state.collaborationMode ? `<button class="btn btn-secondary btn-sm" onclick="showAdoptModal()">✅ 采纳省地接社报价</button><button class="btn btn-ghost btn-sm" onclick="sendCostInquiry()">📤 发送成本询价</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="switchMode()">${state.collaborationMode ? '🔄 切换为自行模式' : '🔄 切换为协作模式'}</button>
          </div>
        </div>
        <div class="iq-section-body">
          <!-- 车型选择 -->
          <div class="quote-tabs">
            ${q.carTypes.map(ct => `
              <div class="quote-tab ${state.selectedCarType === ct.key ? 'active' : ''}" onclick="state.selectedCarType='${ct.key}';renderItineraryQuote()">
                ${ct.label}${ct.recommended ? ' ⭐' : ''}
              </div>
            `).join('')}
          </div>

          <!-- 成本价表 -->
          <table class="quote-table">
            <thead>
              <tr>
                <th>项目</th>
                <th class="num">${carType.label}</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              ${q.items.map(item => `
                <tr class="${item.needsUpdate ? 'needs-update' : ''}">
                  <td>
                    <span style="display:flex;align-items:center;gap:4px">
                      ${item.needsUpdate ? '⚠ ' : ''}${item.label}
                      ${item.needsUpdate ? `<button class="btn btn-ghost btn-sm" style="padding:1px 5px;font-size:11px;color:var(--success)" onclick="clearItemNeedsUpdate('${item.key}')" title="标记已复核">✓</button>` : ''}
                      <button class="btn btn-ghost btn-sm btn-del" style="padding:1px 5px;font-size:11px" onclick="confirmDeleteQuoteItem('${item.key}','${item.label}')">🗑️</button>
                    </span>
                  </td>
                  <td class="num input-cell">
                    <input type="number" value="${item.costs[state.selectedCarType] || 0}"
                           onchange="updateCost('${item.key}', this.value)"
                           ${state.collaborationMode ? 'disabled' : ''}>
                  </td>
                  <td style="font-size:12px;color:var(--text-3)">${item.note}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${state.collaborationMode ? `
            <div class="notice-banner info mt-2" style="margin-top:12px">
              <span>ℹ️</span>
              <span>协作模式：成本价由省地接社通过H5填写。点击"发送成本询价"生成H5链接发给省地接社</span>
            </div>
          ` : ''}

          <!-- 利润表达模式（Q7.1） -->
          <div class="profit-settings" style="margin-top:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
              <span style="font-size:13px;font-weight:600;color:var(--price-2)">利润表达模式</span>
              <div class="toggle-group">
                <button class="${q.priceMode === 'decompose' ? 'active' : ''}" onclick="setPriceMode('decompose')">A 成本+利润分解</button>
                <button class="${q.priceMode === 'bundled' ? 'active' : ''}" onclick="setPriceMode('bundled')">B 含利润直接报价</button>
              </div>
            </div>

            ${q.priceMode === 'bundled' ? `
              <div style="margin-top:8px;padding:10px;background:var(--surface-alt);border-radius:var(--radius-sm)">
                <div style="display:flex;align-items:center;justify-content:space-between">
                  <span style="font-size:13px;font-weight:600">③ 对一手报价（含利润）</span>
                  <span style="font-size:12px;color:var(--text-3)">${q.carTypes.find(c => c.key === state.selectedCarType).label}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:6px">
                  <input type="number" class="form-input" style="width:120px;padding:4px 8px" value="${q.bundledPrice[state.selectedCarType] || 0}" onchange="setBundledPrice(this.value)">
                  <span style="font-size:13px">元</span>
                </div>
                <div style="margin-top:6px;font-size:12px;color:var(--text-3)">
                  ② 一手利润（自动反算）= ${q.bundledPrice[state.selectedCarType] || 0} − ①${fmt(calc.costSubtotal)} = <strong style="color:${calc.loss ? 'var(--danger)' : 'var(--price-2)'}">${fmt(calc.profit)}</strong>${calc.loss ? ' ⚠️ 亏损报价' : ''}
                </div>
              </div>
            ` : `
              <div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <div class="toggle-group">
                  <button class="${q.profit.mode === 'amount' ? 'active' : ''}" onclick="setProfitMode('amount')">按固定金额</button>
                  <button class="${q.profit.mode === 'percent' ? 'active' : ''}" onclick="setProfitMode('percent')">按百分比</button>
                </div>
                <div style="display:flex;align-items:center;gap:6px">
                  <input type="number" class="form-input" style="width:80px;padding:4px 8px" value="${q.profit.value}" onchange="setProfitValue(this.value)">
                  <span style="font-size:13px">${q.profit.mode === 'amount' ? '元' : '%'}</span>
                </div>
                <span style="font-size:12px;color:var(--text-3)">② = ${fmt(calc.profit)} → ③ = ${fmt(calc.agencyQuote)}</span>
              </div>
            `}
          </div>

          <!-- 5级价格 -->
          <div class="price-levels">
            <div class="price-level l1">
              <div class="price-level-label"><span class="price-level-dot"></span>① 成本价</div>
              <div class="price-level-desc">${state.collaborationMode ? '省地接社填写' : '自行填写'}</div>
              <div class="price-level-value">${fmt(calc.costSubtotal)}</div>
            </div>
            <div class="price-level l2 ${calc.loss ? 'loss' : ''}">
              <div class="price-level-label"><span class="price-level-dot"></span>② 一手利润</div>
              <div class="price-level-desc">${q.priceMode === 'bundled' ? '由③反算' : (q.profit.mode === 'amount' ? '固定金额' : q.profit.value + '%')}</div>
              <div class="price-level-value">${fmt(calc.profit)}${calc.loss ? ' ⚠️' : ''}</div>
            </div>
            <div class="price-level l3">
              <div class="price-level-label"><span class="price-level-dot"></span>③ 对旅行社报价</div>
              <div class="price-level-desc">①+②</div>
              <div class="price-level-value" style="font-size:16px">${fmt(calc.agencyQuote)}</div>
            </div>
            <div class="price-level l4">
              <div class="price-level-label"><span class="price-level-dot"></span>④ 旅行社加价</div>
              <div class="price-level-desc">${q.agencyMarkedUp ? `${q.agencyMarkup.mode === 'amount' ? '固定金额' : q.agencyMarkup.value + '%'} · 旅行社已加价` : '旅行社未加价'}</div>
              <div class="price-level-value">${q.agencyMarkedUp ? fmt(calc.markup) : '—'}</div>
            </div>
            <div class="price-level l5">
              <div class="price-level-label"><span class="price-level-dot"></span>⑤ 对游客报价</div>
              <div class="price-level-desc">③+④ · 仅旅行社可见</div>
              <div class="price-level-value" style="font-size:16px">${q.agencyMarkedUp ? fmt(calc.touristQuote) : '—'}</div>
            </div>
          </div>

          ${needsUpdateCount > 0 ? `
            <div style="margin-top:12px;padding:10px;background:var(--danger-light);border-radius:var(--radius-sm);font-size:12px;color:#991b1b">
              ⚠ 行程已变更，以下报价行需更新：${q.items.filter(i => i.needsUpdate).map(i => i.label).join('、')}
              <br>↑ 标红的行需要您更新报价，行程已变更但报价未同步
            </div>
          ` : ''}

          <!-- 操作按钮 -->
          <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="saveAndNotify()">📋 保存并通知</button>
            <button class="btn btn-secondary" onclick="showToast('✅','v${itinerary.version} 已保存为新版本','变更备注已自动生成')">💾 保存为新版本</button>
            <button class="btn btn-secondary" onclick="showToast('📸','报价快照已生成','快照编号 Q2026-001 · 不可修改')">📸 生成报价快照</button>
            <button class="btn btn-secondary" onclick="switchRole('pdf')">📄 导出PDF</button>
          </div>
        </div>
      </div>
    </div>
    ` : state.iqTab === 'customer' ? renderCustomerInfoTab(route) : renderCommTimeline(route)}
  `;
}

function switchIQTab(tab) {
  state.iqTab = tab;
  renderItineraryQuote();
}

function renderCustomerInfoTab(route) {
  const c = getCustomer(route.id) || {};
  return `
    <div class="iq-body" style="grid-template-columns:1fr">
      <div class="iq-section">
        <div class="iq-section-header">
          <div class="iq-section-title">👤 客户基本信息</div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-ghost btn-sm" onclick="showToast('✏️','客户信息已进入编辑模式','修改后将保存为新版本')">✏️ 编辑</button>
            <button class="btn btn-ghost btn-sm btn-del" onclick="confirmDeleteCustomer('${route.id}')">🗑️ 删除</button>
          </div>
        </div>
        <div class="iq-section-body">
          <div class="info-grid">
            <div class="info-field"><div class="info-field-label">客户姓名</div><div class="info-field-value">${route.customer}</div></div>
            <div class="info-field"><div class="info-field-label">中文名</div><div class="info-field-value">${route.customerCn || '—'}</div></div>
            <div class="info-field"><div class="info-field-label">国籍</div><div class="info-field-value">${c.country || '—'}</div></div>
            <div class="info-field"><div class="info-field-label">联系方式</div><div class="info-field-value">${c.contact || '—'}</div></div>
          </div>
          <div class="info-grid" style="margin-top:16px">
            <div class="info-field"><div class="info-field-label">出行人数</div><div class="info-field-value">${route.groupSize}人</div></div>
            <div class="info-field"><div class="info-field-label">出行时间</div><div class="info-field-value">${route.travelDate}</div></div>
            <div class="info-field"><div class="info-field-label">旅行社</div><div class="info-field-value">${route.agency}</div></div>
            <div class="info-field"><div class="info-field-label">创建时间</div><div class="info-field-value">${c.createTime || '—'}</div></div>
          </div>
          <div style="display:flex;gap:6px;margin-top:16px;flex-wrap:wrap">
            <span class="badge ${route.statusKey === 'confirmed' ? 'badge-success' : route.statusKey === 'lost' ? 'badge-gray' : 'badge-warning'}">${route.status}</span>
            <span class="badge ${route.modeKey === 'collab' ? 'badge-purple' : 'badge-brand'}">${route.mode}</span>
            <span class="badge badge-info">${route.version}</span>
            ${c.hasInitialPlan ? '<span class="badge badge-info">有行程草案</span>' : ''}
          </div>
        </div>
      </div>

      ${c.hasInitialPlan ? `
      <div class="iq-section">
        <div class="iq-section-header">
          <div class="iq-section-title">📋 行程规划草案</div>
          <span class="badge badge-info">旅行社填写</span>
        </div>
        <div class="iq-section-body" style="font-size:14px;line-height:2">
          D1：抵达成都，专车接机<br>
          D2-D3：九寨沟（游客偏好五星级酒店）<br>
          D4：黄龙<br>
          D5-D6：成都周边（都江堰/乐山）<br>
          D7：乐山大佛<br>
          D8：返程<br>
          <span style="color:var(--text-3)">预算中等，游客偏好五星级酒店</span>
        </div>
      </div>
      ` : ''}

      <div class="iq-section">
        <div class="iq-section-header">
          <div class="iq-section-title">📊 客户状态流转</div>
        </div>
        <div class="iq-section-body">
          <div style="display:flex;align-items:center;gap:12px;font-size:13px;flex-wrap:wrap">
            <span class="badge badge-info">咨询中</span>
            <span style="color:var(--text-3)">→</span>
            <span class="badge badge-brand">已报价</span>
            <span style="color:var(--text-3)">→</span>
            <span class="badge badge-brand">旅行社已报价</span>
            <span style="color:var(--text-3)">→</span>
            <span class="badge ${route.statusKey === 'confirmed' ? 'badge-success' : 'badge-warning'}">${route.status}</span>
            <span style="color:var(--text-3)">→</span>
            <span class="badge badge-success">已成单</span>
          </div>
        </div>
      </div>

      <div class="iq-section">
        <div class="iq-section-header">
          <div class="iq-section-title">📋 版本历史</div>
          <button class="btn btn-ghost btn-sm" onclick="switchIQTab('quote')">查看行程报价 →</button>
        </div>
        <div class="iq-section-body" style="padding:0">
          <table class="table">
            <thead><tr><th>版本</th><th>修改时间</th><th>修改人</th><th>修改备注</th><th>操作</th></tr></thead>
            <tbody>
              <tr><td><span class="tag">v3</span></td><td>2026-07-09 14:30</td><td>张运营</td><td>D3酒店升级为希尔顿；D5增加特色体验</td><td><button class="btn btn-ghost btn-sm" onclick="switchIQTab('quote')">查看</button></td></tr>
              <tr><td><span class="tag">v2</span></td><td>2026-07-08 15:30</td><td>张运营</td><td>D3酒店升级；新增D8返程日</td><td><button class="btn btn-ghost btn-sm">查看</button></td></tr>
              <tr><td><span class="tag">v1</span></td><td>2026-07-06 11:00</td><td>张运营</td><td>从模板创建</td><td><button class="btn btn-ghost btn-sm">查看</button></td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function toggleEditDay(dayNum) {
  showToast('✏️', `Day ${dayNum} 已进入编辑模式`, '修改行程后关联报价行将标记"需更新"');
}

function showFeedback(dayNum, content) {
  showModal(`Day ${dayNum} 反馈`, `
    <div class="notice-banner"><span>📝</span><span>泰国A旅行社 Somchai 提交的反馈</span></div>
    <div style="padding:12px;background:var(--surface-alt);border-radius:var(--radius-sm);font-size:14px">${content}</div>
    <div style="margin-top:12px;font-size:13px;color:var(--text-3)">关联：行程 Day${dayNum} + 报价酒店行</div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">关闭</button><button class="btn btn-primary" onclick="closeModal();showToast('✅','反馈已标记为已处理','已同步修改行程和报价')">标记为已处理</button>`);
}

function toggleEditDay(dayNum) {
  showToast('✏️', `Day ${dayNum} 已进入编辑模式`, '修改行程后关联报价行将标记"需更新"');
}

function saveDayField(dayNum, field, el) {
  const day = MOCK_DATA.itinerary.days.find(d => d.day === dayNum);
  if (day) {
    const txt = (el.innerText || '').trim();
    day[field] = txt === '—' ? '' : txt;
    if (field === 'hotel') recalcQuantityItems(); // 住宿变化影响酒店晚数
    markAutoSaved();
  }
}

function addDay() {
  const itinerary = MOCK_DATA.itinerary;
  const newDay = itinerary.days.length + 1;
  itinerary.days.push({
    day: newDay, date: `7/${15 + newDay - 1}`, city: "待定", hotel: "",
    attractions: "待规划", meals: "待定", transport: "待定", hasFeedback: false,
  });
  // Q2.1 自动调按量项数量 + 标红需更新
  recalcQuantityItems();
  markAutoSaved();
  renderItineraryQuote();
  showToast('✅', `Day ${newDay} 已添加`, '包车天数已自动+1，关联报价行已标记"需更新"');
}

function confirmDeleteDay(dayNum) {
  const itinerary = MOCK_DATA.itinerary;
  if (itinerary.days.length <= 1) {
    showToast('⚠️', '无法删除', '行程至少需要保留1天');
    return;
  }
  const day = itinerary.days.find(d => d.day === dayNum);
  showModal('确认删除行程天', `
    <div class="confirm-warn">
      <span class="confirm-warn-icon">⚠️</span>
      <div>即将删除 <strong>Day ${dayNum}</strong>（${day ? day.city : ''} · ${day ? day.attractions : ''}）</div>
    </div>
    <div style="margin-top:12px;font-size:13px;color:var(--text-3)">
      删除后后续天数将自动重新编号（Day${dayNum+1} → Day${dayNum} ...），关联报价行将标记"需更新"。
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" onclick="doDeleteDay(${dayNum})">确认删除</button>
  `);
}

function doDeleteDay(dayNum) {
  const itinerary = MOCK_DATA.itinerary;
  itinerary.days = itinerary.days.filter(d => d.day !== dayNum);
  // 重新编号
  itinerary.days.forEach((d, idx) => { d.day = idx + 1; });
  // Q2.2 自动调按量项数量 + 标红需更新
  recalcQuantityItems();
  markAutoSaved();
  closeModal();
  showToast('🗑️', `Day ${dayNum} 已删除`, `剩余 ${itinerary.days.length} 天，天数已重新编号，包车/酒店数量已同步，报价行已标记"需更新"`);
  renderItineraryQuote();
}

function updateCost(itemKey, value) {
  const item = MOCK_DATA.quote.items.find(i => i.key === itemKey);
  if (item) {
    const v = parseInt(value);
    if (isNaN(v) || v < 0) { showToast('⚠️', '成本不能为负数', '请输入 0 或正数'); renderItineraryQuote(); return; }
    item.costs[state.selectedCarType] = v;
    item.needsUpdate = false;
    markAutoSaved();
    renderItineraryQuote();
  }
}

function setProfitMode(mode) {
  MOCK_DATA.quote.profit.mode = mode;
  MOCK_DATA.quote.profit.value = mode === 'amount' ? 5000 : 15;
  markAutoSaved();
  renderItineraryQuote();
}

function setProfitValue(val) {
  MOCK_DATA.quote.profit.value = parseInt(val) || 0;
  markAutoSaved();
  renderItineraryQuote();
}

function switchMode() {
  state.collaborationMode = !state.collaborationMode;
  renderItineraryQuote();
  showToast('🔄', `已切换为${state.collaborationMode ? '协作' : '自行'}模式`, state.collaborationMode ? '成本价由省地接社通过H5填写' : '成本价由一手地接社自行填写');
}

function sendCostInquiry() {
  showToast('📋', '成本询价H5链接已复制到剪贴板', '📌 成本询价 · John Smith · v3 · 8天7晚，5人，请填写成本价\n👉 请粘贴到微信发给省地接社');
}

function showAdoptModal() {
  showModal('采纳省地接社成本价', `
    <div class="notice-banner info"><span>ℹ️</span><span>省地接社（新疆A旅行社）已通过H5提交成本价，以下为最新报价</span></div>
    <table class="quote-table" style="margin-top:10px">
      <thead><tr><th>项目</th><th class="num">7座</th><th class="num">9座</th><th class="num">14座</th></tr></thead>
      <tbody>
        <tr><td>酒店（7晚）</td><td class="num">¥6,000</td><td class="num">¥6,000</td><td class="num">¥6,000</td></tr>
        <tr><td>包车</td><td class="num">¥15,000</td><td class="num">¥17,000</td><td class="num">¥20,000</td></tr>
        <tr><td>门票</td><td class="num">¥3,000</td><td class="num">¥3,000</td><td class="num">¥3,000</td></tr>
        <tr><td>服务费</td><td class="num">¥2,000</td><td class="num">¥2,000</td><td class="num">¥2,000</td></tr>
      </tbody>
    </table>
    <p style="font-size:13px;color:var(--text-3);margin-top:8px">采纳后将回填①成本价并清除"需更新"标记，你可继续设置利润。</p>
  `, `<button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="adoptProvincialCost()">✅ 采纳并回填</button>`);
}

function addQuoteItem() {
  showModal('新增报价项', `
    <div class="form-group">
      <label class="form-label">项目名称 <span style="color:var(--danger)">*</span></label>
      <input id="newItemLabel" class="form-input" placeholder="例如：签证费、保险、导游小费" autofocus>
    </div>
    <div class="form-group">
      <label class="form-label">备注（可选）</label>
      <input id="newItemNote" class="form-input" placeholder="简要说明此项内容">
    </div>
    <div style="display:flex;gap:12px;margin-top:8px">
      <div class="form-group" style="flex:1">
        <label class="form-label">7座商务车</label>
        <input id="newCost7" class="form-input" type="number" value="0" placeholder="0">
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">9座商务车</label>
        <input id="newCost9" class="form-input" type="number" value="0" placeholder="0">
      </div>
      <div class="form-group" style="flex:1">
        <label class="form-label">14座中巴</label>
        <input id="newCost14" class="form-input" type="number" value="0" placeholder="0">
      </div>
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="doAddQuoteItem()">确认添加</button>
  `);
  // 聚焦输入框
  setTimeout(() => { const el = $('#newItemLabel'); if (el) el.focus(); }, 100);
}

function doAddQuoteItem() {
  const label = ($('#newItemLabel').value || '').trim();
  if (!label) { showToast('⚠️', '请填写项目名称', ''); return; }
  const note = ($('#newItemNote') || {}).value.trim() || '';
  const key = 'custom_' + Date.now();
  const newItem = {
    key, label, note,
    needsUpdate: false,
    costs: {
      '7seat': parseInt($('#newCost7').value) || 0,
      '9seat': parseInt($('#newCost9').value) || 0,
      '14seat': parseInt($('#newCost14').value) || 0,
    }
  };
  MOCK_DATA.quote.items.push(newItem);
  closeModal();
  markAutoSaved();
  showToast('✅', `报价项"${label}"已添加`, '可在报价表中编辑各车型价格');
  renderItineraryQuote();
}

function confirmDeleteQuoteItem(itemKey, itemLabel) {
  showModal('确认删除报价项', `
    <div class="confirm-warn">
      <span class="confirm-warn-icon">⚠️</span>
      <div>即将删除报价项：<strong>${itemLabel}</strong></div>
    </div>
    <div style="margin-top:12px;font-size:13px;color:var(--text-3)">
      删除后该行在各车型的成本数据将一并清除，5级价格合计将自动重新计算。
    </div>
  `, `
    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" onclick="doDeleteQuoteItem('${itemKey}')">确认删除</button>
  `);
}

function doDeleteQuoteItem(itemKey) {
  const idx = MOCK_DATA.quote.items.findIndex(i => i.key === itemKey);
  if (idx >= 0) {
    const removed = MOCK_DATA.quote.items.splice(idx, 1)[0];
    closeModal();
    markAutoSaved();
    showToast('🗑️', `报价项"${removed.label}"已删除`, '5级价格已自动重新计算');
    renderItineraryQuote();
  }
}

function saveAndNotify() {
  // Q5.2 空报价单拦截
  if (MOCK_DATA.quote.items.length === 0) {
    showToast('⚠️', '报价单不能为空', '请至少添加一项报价后再保存并通知');
    return;
  }
  const needsUpdate = MOCK_DATA.quote.items.filter(i => i.needsUpdate);
  if (needsUpdate.length > 0) {
    showModal('确认保存并通知', `
      <div class="notice-banner"><span>⚠️</span><span>仍有 <strong>${needsUpdate.length}项报价未更新</strong>（${needsUpdate.map(i => i.label).join('、')}）</span></div>
      <p style="font-size:14px;color:var(--text-2)">行程已变更但部分报价未同步，确认保存并通知旅行社吗？</p>
      <p style="font-size:13px;color:var(--text-3);margin-top:8px">建议：先更新标红的报价行再保存，避免报价与行程不一致</p>
    `, `<button class="btn btn-secondary" onclick="closeModal()">先去更新</button><button class="btn btn-primary" onclick="closeModal();doSaveAndNotify()">继续保存</button>`);
  } else {
    doSaveAndNotify();
  }
}

function doSaveAndNotify() {
  const calc = calcQuote(state.selectedCarType);
  const it = MOCK_DATA.itinerary;
  // Q3.1 仅"保存并通知"版本+1
  const m = (it.version || 'v3').match(/v(\d+)/);
  const nextV = 'v' + (m ? parseInt(m[1]) + 1 : 4);
  it.version = nextV;
  it.draft = false; // 转正发布
  MOCK_DATA.routes.forEach(r => { if (r.id === it.customerId) { r.version = nextV; r.status = r.status; } });
  // Q6.3 复制H5链接
  showToast('📋', nextV + ' 已保存，链接已复制到剪贴板', `📌 John Smith · 九寨沟8日游 · ${nextV} 行程报价已更新\n📝 摘要：报价${state.selectedCarType === '7seat' ? '7座' : state.selectedCarType === '9seat' ? '9座' : '14座'}${fmt(calc.agencyQuote)}起\n👉 点击查看完整行程与报价，可在页面底部反馈修改意见`);
}

/* ============================================
   View: 沟通记录中心
   ============================================ */
function renderCommTimeline(route) {
  const records = MOCK_DATA.communications;
  const colorMap = { brand: '', warning: 'warning', success: 'success', danger: 'danger', info: '' };
  const unread = MOCK_DATA.stats.overdue || 0;

  return `
    <div class="iq-body" style="grid-template-columns:1fr">
      <div class="iq-section">
        <div class="iq-section-header">
          <div class="iq-section-title">💬 沟通时间线 — ${route.customer} · ${route.destination}</div>
          <div style="display:flex;gap:6px">
            <select class="filter-select"><option>全部类型</option><option>行程修改</option><option>报价变更</option><option>链接打开</option><option>反馈</option><option>手动备注</option></select>
            <button class="btn btn-secondary btn-sm" onclick="showToast('📝','备注已添加','已记录到沟通时间线')">＋ 添加备注</button>
          </div>
        </div>
        <div class="iq-section-body">
          <div class="timeline">
            ${records.map(r => `
              <div class="timeline-item ${colorMap[r.color] || ''}">
                <div class="timeline-time">${r.time}</div>
                <div class="timeline-content">
                  <div class="timeline-title">${r.title}</div>
                  <div class="timeline-desc">${r.desc}</div>
                </div>
              </div>
            `).join('')}
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px">
            <div class="comm-stats">
              <div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:8px">📊 互动统计</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px">
                <div><div style="color:var(--text-3);font-size:12px">H5链接打开</div><div style="font-size:18px;font-weight:700">7 次</div></div>
                <div><div style="color:var(--text-3);font-size:12px">旅行社反馈</div><div style="font-size:18px;font-weight:700">3 次</div></div>
                <div><div style="color:var(--text-3);font-size:12px">版本修改</div><div style="font-size:18px;font-weight:700">3 次</div></div>
                <div><div style="color:var(--text-3);font-size:12px">保存并通知</div><div style="font-size:18px;font-weight:700">3 次</div></div>
              </div>
            </div>
            <div class="comm-actions">
              <div style="font-size:13px;font-weight:600;color:var(--text-2);margin-bottom:8px">📌 快捷操作</div>
              <div style="display:flex;flex-direction:column;gap:8px">
                <button class="btn btn-secondary w-full" onclick="showToast('📋','H5链接已复制','可粘贴到微信通知旅行社')">📋 复制H5链接</button>
                <button class="btn btn-secondary w-full" onclick="showToast('⚡','催办链接已复制','已生成催办H5链接')">⚡ 催办旅行社</button>
                <button class="btn btn-secondary w-full" onclick="showToast('📚','已沉淀为知识库条目','条目编号 KB011')">📚 沉淀为知识</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ============================================
   View: 知识库
   ============================================ */
function renderKnowledgeBase() {
  const content = $('#content');
  const categories = [...new Set(MOCK_DATA.knowledgeBase.map(k => k.category))];
  let activeCategory = state.kbCategory || 'all';
  let items = activeCategory === 'all' ? MOCK_DATA.knowledgeBase : MOCK_DATA.knowledgeBase.filter(k => k.category === activeCategory);

  content.innerHTML = `
    <div class="kb-grid">
      <div class="kb-sidebar">
        <div style="font-size:13px;font-weight:600;color:var(--text-3);padding:8px 12px;margin-bottom:4px">分类</div>
        <div class="kb-category ${activeCategory === 'all' ? 'active' : ''}" onclick="state.kbCategory='all';renderKnowledgeBase()">
          <span>📚 全部</span><span class="badge badge-gray">${MOCK_DATA.knowledgeBase.length}</span>
        </div>
        ${categories.map(cat => `
          <div class="kb-category ${activeCategory === cat ? 'active' : ''}" onclick="state.kbCategory='${cat}';renderKnowledgeBase()">
            <span>${getCategoryIcon(cat)} ${cat}</span>
            <span class="badge badge-gray">${MOCK_DATA.knowledgeBase.filter(k => k.category === cat).length}</span>
          </div>
        `).join('')}
        <div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px">
          <button class="btn btn-primary btn-sm w-full" onclick="showModal('新增知识条目','<div class=form-group><label class=form-label>问题</label><input class=form-input placeholder=如：泰国游客需要什么证件？></div><div class=form-group><label class=form-label>标准答案</label><textarea class=form-textarea placeholder=输入标准答案...></textarea></div><div class=form-group><label class=form-label>标签</label><input class=form-input placeholder=如：签证,泰国></div>','<button class=btn btn-secondary onclick=closeModal()>取消</button><button class=btn btn-primary onclick=closeModal();showToast(✅,知识条目已创建,条目编号 KB011)>创建</button>')">＋ 新增条目</button>
        </div>
      </div>

      <div>
        <input class="filter-select w-full" style="margin-bottom:12px;padding:10px 14px" placeholder="🔍 搜索知识库..." oninput="filterKB(this.value)">
        <div class="kb-list" id="kbList">
          ${items.map(k => `
            <div class="kb-card" onclick="showKnowledgeDetail('${k.id}')">
              <div class="kb-card-q">${k.question}</div>
              <div class="kb-card-a">${k.answer}</div>
              <div class="kb-card-tags">
                <span class="badge badge-gray">${k.category}</span>
                ${k.tags.map(t => `<span class="tag">${t}</span>`).join('')}
                <span style="font-size:11px;color:var(--text-3);margin-left:auto">👁 ${k.views}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function getCategoryIcon(cat) {
  const icons = { '签证': '🛂', '交通': '🚗', '酒店': '🏨', '行程': '🗺️', '餐饮': '🍽️', '报价': '💰' };
  return icons[cat] || '📌';
}

function filterKB(query) {
  const list = $('#kbList');
  if (!query) { renderKnowledgeBase(); return; }
  const q = query.toLowerCase();
  const activeCategory = state.kbCategory || 'all';
  let items = activeCategory === 'all' ? MOCK_DATA.knowledgeBase : MOCK_DATA.knowledgeBase.filter(k => k.category === activeCategory);
  items = items.filter(k => k.question.toLowerCase().includes(q) || k.answer.includes(q) || k.tags.some(t => t.includes(q)));
  list.innerHTML = items.map(k => `
    <div class="kb-card" onclick="showKnowledgeDetail('${k.id}')">
      <div class="kb-card-q">${k.question}</div>
      <div class="kb-card-a">${k.answer}</div>
      <div class="kb-card-tags"><span class="badge badge-gray">${k.category}</span>${k.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
    </div>
  `).join('') || '<div class="empty-state" style="padding:40px"><div class="icon">🔍</div>未找到匹配条目</div>';
}

function showKnowledgeDetail(id) {
  const k = MOCK_DATA.knowledgeBase.find(x => x.id === id);
  showModal(k.question, `
    <div style="font-size:14px;line-height:1.8;color:var(--text-1)">${k.answer}</div>
    <div style="margin-top:16px;display:flex;gap:6px;flex-wrap:wrap">
      <span class="badge badge-gray">${k.category}</span>
      ${k.tags.map(t => `<span class="tag">${t}</span>`).join('')}
    </div>
    <div style="margin-top:12px;font-size:12px;color:var(--text-3)">浏览 ${k.views} 次 · 条目编号 ${k.id}</div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">关闭</button><button class="btn btn-primary" onclick="closeModal();showToast('📋','已复制到剪贴板','可粘贴到微信回复游客')">复制答案</button>`);
}

/* ============================================
   View: 账号管理
   ============================================ */
function renderAccountManagement() {
  const content = $('#content');
  const orgs = MOCK_DATA.accounts;
  let activeOrg = state.activeOrg || 'pandaking';
  const org = orgs[activeOrg];

  content.innerHTML = `
    <div class="stat-cards">
      <div class="stat-card"><div class="stat-label">总账号数</div><div class="stat-value">${Object.values(orgs).reduce((s, o) => s + o.members.length, 0)}</div></div>
      <div class="stat-card"><div class="stat-label">旅行社数</div><div class="stat-value">${Object.keys(orgs).filter(k => !['pandaking','xinjiang-a','sichuan','yunnan'].includes(k)).length}</div></div>
      <div class="stat-card"><div class="stat-label">省地接社数</div><div class="stat-value">3</div></div>
      <div class="stat-card"><div class="stat-label">周活跃率</div><div class="stat-value">75%</div></div>
    </div>

    <div class="org-tabs">
      ${Object.entries(orgs).map(([key, o]) => `
        <div class="org-tab ${activeOrg === key ? 'active' : ''}" onclick="state.activeOrg='${key}';renderAccountManagement()">
          ${getOrgIcon(key)} ${o.name} <span class="count">(${o.members.length})</span>
        </div>
      `).join('')}
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">${org.name} · 成员列表</span>
        <button class="btn btn-primary btn-sm" onclick="openInviteModal('${activeOrg}')">⊕ 邀请成员</button>
      </div>
      <div class="card-body" style="padding:0">
        <table class="table">
          <thead><tr><th>姓名</th><th>角色</th><th>状态</th><th>加入时间</th><th>最后登录</th><th>操作</th></tr></thead>
          <tbody>
            ${org.members.map(m => `
              <tr>
                <td style="font-weight:600">${m.name}</td>
                <td><span class="badge ${m.role.includes('管理') ? 'badge-purple' : m.role.includes('省地接') ? 'badge-info' : 'badge-brand'}">${m.role}</span></td>
                <td><span class="badge badge-success">● 活跃</span></td>
                <td>${m.joinDate}</td>
                <td style="color:var(--text-3)">${m.lastLogin}</td>
                <td>
                  <button class="btn btn-ghost btn-sm" onclick="showToast('⚠️','已下线账号','${m.name} 的登录态已失效')">下线</button>
                  <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="showToast('🗑️','已删除账号','${m.name} 已从系统中删除')">删除</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="notice-banner info mt-4" style="margin-top:16px">
      <span>ℹ️</span>
      <span><strong>邀请制准入</strong>：管理者邀请 → 员工微信授权登录 → 直接获得权限（无需审核）。邀请一次永久有效，30天登录态到期重新授权不需要重新邀请。</span>
    </div>
  `;
}

function getOrgIcon(key) {
  if (key === 'pandaking') return '🧳';
  if (['xinjiang-a', 'sichuan', 'yunnan'].includes(key)) return '🗺️';
  return '✈️';
}

function openInviteModal(orgKey) {
  const org = MOCK_DATA.accounts[orgKey];
  const isPandaKing = orgKey === 'pandaking';
  const roles = isPandaKing ? ['一手地接社运营', '一手地接社管理者'] :
    ['xinjiang-a','sichuan','yunnan'].includes(orgKey) ? ['省地接社运营', '省地接社管理者'] :
    ['旅行社销售', '旅行社管理者'];
  showModal(`邀请成员 — ${org.name}`, `
    <div class="notice-banner info"><span>📨</span><span>邀请链接发送后，员工微信授权登录即直接获得权限，无需审核</span></div>
    <div class="form-group"><label class="form-label">姓名</label><input class="form-input" placeholder="被邀请人姓名"></div>
    <div class="form-group"><label class="form-label">角色</label><select class="form-select">${roles.map(r => `<option>${r}</option>`).join('')}</select></div>
    <div class="form-group"><label class="form-label">邀请链接</label><input class="form-input" readonly value="https://travel.pandaking9.com/invite?org=${orgKey}&token=xxx" style="font-size:12px;color:var(--text-3)"></div>
  `, `<button class="btn btn-secondary" onclick="closeModal()">取消</button><button class="btn btn-primary" onclick="closeModal();showToast('📨','邀请链接已复制到剪贴板','请粘贴到微信发送给被邀请人')">复制邀请链接</button>`);
}

/* ============================================
   View: H5 旅行社视角 (Mobile)
   ============================================ */
function renderH5Shell(role) {
  const titles = { 'travel-agency': '行程报价协作', 'provincial': '成本询价协作' };
  const userName = role === 'travel-agency' ? 'Somchai · 泰国A旅行社' : '阿依古丽 · 新疆A旅行社';
  return `
    <div style="height:100vh;background:#ededed;display:flex;flex-direction:column">
      <header class="h5-shell-header" style="background:var(--surface);border-bottom:1px solid var(--border);padding:10px 24px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <button class="btn btn-ghost btn-sm" onclick="switchRole('pandaking')" style="flex-shrink:0">← 返回</button>
          <span style="font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${role === 'travel-agency' ? '旅行社·H5协作' : '省地接社·H5协作'}</span>
        </div>
        <div class="role-switcher" style="flex-shrink:0">
          <button class="${state.role === 'pandaking' ? 'active' : ''}" onclick="switchRole('pandaking')">桌面端</button>
          <button class="${state.role === 'travel-agency' ? 'active' : ''}" onclick="switchRole('travel-agency')">旅行社</button>
          <button class="${state.role === 'provincial' ? 'active' : ''}" onclick="switchRole('provincial')">省地接</button>
          <button class="${state.role === 'pdf' ? 'active' : ''}" onclick="switchRole('pdf')">PDF</button>
        </div>
      </header>
      <div style="flex:1;overflow-y:auto">
        <div class="mobile-frame" id="mobileFrame">
          <div class="mobile-statusbar">
            <span id="mobileTime">9:41</span>
            <span style="display:flex;gap:4px;align-items:center">📶 📡 🔋</span>
          </div>
          <div class="mobile-wechat-header">
            <span style="font-size:20px;color:var(--text-3)">‹</span>
            <span>${titles[role]}</span>
            <span style="font-size:20px;color:var(--text-3)">⋯</span>
          </div>
          <div class="mobile-content" id="mobileContent"></div>
        </div>
      </div>
    </div>`;
}

function renderH5TravelAgency() {
  const mc = $('#mobileContent');
  if (!mc) return;
  const itinerary = MOCK_DATA.itinerary;
  const q = MOCK_DATA.quote;
  const calc = calcQuote(state.selectedCarType);
  const carType = q.carTypes.find(c => c.key === state.selectedCarType);

  mc.innerHTML = `
    <!-- 客户信息 -->
    <div class="mobile-card">
      <div class="mobile-card-header">
        <div class="mobile-card-title">📌 John Smith · 九寨沟8日游</div>
        <span class="badge badge-brand">${itinerary.version}</span>
      </div>
      <div class="mobile-card-body" style="display:flex;gap:12px;font-size:12px;color:var(--text-3)">
        <span>5人</span><span>·</span><span>2026-07-20</span><span>·</span><span>泰国A旅行社</span>
      </div>
    </div>

    <!-- 行程详情 -->
    <div class="mobile-card">
      <div class="mobile-card-header">
        <div class="mobile-card-title">📅 行程详情</div>
        <span class="badge badge-gray">8天7晚</span>
      </div>
      <div class="mobile-card-body">
        ${itinerary.days.map(day => `
          <div class="mobile-day-item">
            <div class="mobile-day-header">
              <span class="mobile-day-label">Day ${day.day}</span>
              <span style="font-size:11px;color:var(--text-3)">${day.date} · ${day.city}</span>
              ${day.hasFeedback ? '<span style="font-size:11px;color:var(--warning)">📝 有反馈</span>' : ''}
            </div>
            <div class="mobile-day-content">
              ${day.hotel ? '🏨 ' + day.hotel + '<br>' : ''}
              🏞️ ${day.attractions}<br>
              🍽️ ${day.meals}<br>
              🚗 ${day.transport}
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- 报价详情 -->
    <div class="mobile-card">
      <div class="mobile-card-header">
        <div class="mobile-card-title">💰 报价详情</div>
        <div style="display:flex;gap:3px">
          ${q.carTypes.map(ct => `
            <button onclick="state.selectedCarType='${ct.key}';renderH5TravelAgency()"
                    style="padding:3px 8px;font-size:11px;border-radius:4px;${state.selectedCarType===ct.key?'background:var(--brand);color:#fff':'background:var(--surface-alt);color:var(--text-2)'}">${ct.label.replace('商务车','').replace('中巴','')}</button>
          `).join('')}
        </div>
      </div>
      <div class="mobile-card-body">
        <div class="mobile-quote-row"><span>酒店（7晚）</span><span style="font-weight:600">${fmt(q.items[0].costs[state.selectedCarType])}</span></div>
        <div class="mobile-quote-row"><span>包车（8天）</span><span style="font-weight:600">${fmt(q.items[1].costs[state.selectedCarType])}</span></div>
        <div class="mobile-quote-row"><span>门票</span><span style="font-weight:600">${fmt(q.items[2].costs[state.selectedCarType])}</span></div>
        <div class="mobile-quote-row"><span>服务费</span><span style="font-weight:600">${fmt(q.items[3].costs[state.selectedCarType])}</span></div>
        ${q.items[4].costs[state.selectedCarType] > 0 ? `<div class="mobile-quote-row"><span>特色体验</span><span style="font-weight:600">${fmt(q.items[4].costs[state.selectedCarType])}</span></div>` : ''}
        <div class="mobile-quote-row" style="border-top:2px solid var(--brand);padding-top:8px;margin-top:4px">
          <span style="font-weight:700;color:var(--brand)">对旅行社报价</span>
          <span style="font-weight:700;color:var(--brand);font-size:16px">${fmt(calc.agencyQuote)}</span>
        </div>
        ${q.agencyMarkedUp ? `
          <div class="mobile-quote-row">
            <span style="color:var(--price-4)">+ 旅行社加价</span>
            <span style="color:var(--price-4);font-weight:600">${fmt(calc.markup)}</span>
          </div>
          <div class="mobile-quote-row" style="background:var(--price-5-bg);padding:8px;border-radius:4px;margin-top:4px">
            <span style="font-weight:700;color:var(--price-5)">对游客报价</span>
            <span style="font-weight:700;color:var(--price-5);font-size:16px">${fmt(calc.touristQuote)}</span>
          </div>
        ` : ''}
        <div style="margin-top:8px;font-size:11px;color:var(--text-3)">备注：${q.items.map(i => i.note).filter(Boolean).join('；')}</div>
      </div>
    </div>

    <!-- 反馈区 -->
    <div class="mobile-card">
      <div class="mobile-card-header">
        <div class="mobile-card-title">📝 反馈修改意见</div>
        <span class="badge badge-warning">可关联行程+报价</span>
      </div>
      <div class="mobile-card-body">
        <div class="mobile-feedback-area" style="padding:0">
          <div class="mobile-feedback-row has-association">
            <div class="mobile-feedback-selects">
              <select><option>关联行程</option><option>Day 1</option><option>Day 2</option><option selected>Day 3</option><option>Day 4</option><option>Day 5</option></select>
              <select><option>关联报价</option><option selected>酒店行</option><option>包车行</option><option>门票行</option><option>服务费行</option></select>
            </div>
            <textarea style="width:100%;border:1px solid var(--border);border-radius:4px;padding:6px;font-size:13px;min-height:50px" placeholder="反馈内容...">D3酒店太贵了，建议换¥800以内的</textarea>
          </div>
          <div class="mobile-feedback-row">
            <div class="mobile-feedback-selects">
              <select><option>关联行程</option><option>Day 1</option><option>Day 2</option><option>Day 3</option><option>Day 4</option><option>Day 5</option></select>
              <select><option>关联报价</option><option selected>包车行</option><option>酒店行</option><option>门票行</option></select>
            </div>
            <textarea style="width:100%;border:1px solid var(--border);border-radius:4px;padding:6px;font-size:13px;min-height:50px" placeholder="反馈内容...">包车7座方案可以接受</textarea>
          </div>
          <button class="btn btn-secondary btn-sm" style="margin-top:4px" onclick="addFeedbackRow(this)">＋ 添加更多反馈</button>
        </div>
      </div>
    </div>

    <!-- 加价区 -->
    ${!q.agencyMarkedUp ? `
      <div class="mobile-card">
        <div class="mobile-card-header">
          <div class="mobile-card-title">💰 加价生成游客报价</div>
        </div>
        <div class="mobile-card-body">
          <div style="display:flex;gap:6px;margin-bottom:10px">
            <button style="flex:1;padding:6px;border-radius:4px;background:var(--brand);color:#fff;font-size:13px">按固定金额</button>
            <button style="flex:1;padding:6px;border-radius:4px;background:var(--surface-alt);font-size:13px">按百分比</button>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <input type="number" value="3000" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:4px;font-size:14px">
            <span style="font-size:13px">元</span>
          </div>
          <div style="margin-top:8px;padding:10px;background:var(--price-5-bg);border-radius:4px;display:flex;justify-content:space-between">
            <span style="font-weight:600;color:var(--price-5)">对游客报价</span>
            <span style="font-weight:700;color:var(--price-5);font-size:16px">${fmt(calc.agencyQuote + 3000)}</span>
          </div>
        </div>
      </div>
    ` : `
      <div class="mobile-card" style="border-left:3px solid var(--success)">
        <div class="mobile-card-body" style="font-size:13px">
          ✅ 已加价 <strong>${fmt(calc.markup)}</strong>（按固定金额）· 游客报价 <strong style="color:var(--price-5)">${fmt(calc.touristQuote)}</strong>
        </div>
      </div>
    `}

    <!-- 操作按钮 -->
    <div class="mobile-action-bar">
      <button class="mobile-btn mobile-btn-secondary" onclick="switchRole('pdf')">📄 PDF</button>
      <button class="mobile-btn mobile-btn-secondary" onclick="showToast('✅','报价已确认','已通知一手地接社')">✓ 确认</button>
      <button class="mobile-btn mobile-btn-primary" onclick="h5SubmitFeedback()">📋 提交反馈</button>
    </div>
  `;
}

function addFeedbackRow(btn) {
  const area = btn.parentElement;
  const row = document.createElement('div');
  row.className = 'mobile-feedback-row';
  row.innerHTML = `
    <div class="mobile-feedback-selects">
      <select><option>关联行程</option><option>Day 1</option><option>Day 2</option><option>Day 3</option><option>Day 4</option><option>Day 5</option></select>
      <select><option>关联报价</option><option>酒店行</option><option>包车行</option><option>门票行</option></select>
    </div>
    <textarea style="width:100%;border:1px solid var(--border);border-radius:4px;padding:6px;font-size:13px;min-height:50px" placeholder="反馈内容..."></textarea>
  `;
  area.insertBefore(row, btn);
}

function h5SubmitFeedback() {
  showToast('✅', '反馈已提交！', '📋 反馈摘要：\n- D3酒店太贵，建议换¥800以内的\n- 包车7座方案可以接受\n\n[复制链接通知一手地接社]');
}

/* ============================================
   View: H5 省地接社视角 (Mobile)
   ============================================ */
function renderH5Provincial() {
  const mc = $('#mobileContent');
  if (!mc) return;
  const itinerary = MOCK_DATA.itinerary;
  const q = MOCK_DATA.quote;

  mc.innerHTML = `
    <!-- 成本询价信息 -->
    <div class="mobile-card">
      <div class="mobile-card-header">
        <div class="mobile-card-title">📌 成本询价 · 九寨沟8日游</div>
        <span class="badge badge-info">${itinerary.version}</span>
      </div>
      <div class="mobile-card-body" style="display:flex;gap:12px;font-size:12px;color:var(--text-3)">
        <span>客户：John Smith</span><span>·</span><span>5人</span><span>·</span><span>PandaKing</span>
      </div>
    </div>

    <!-- 行程需求（可编辑） -->
    <div class="mobile-card">
      <div class="mobile-card-header">
        <div class="mobile-card-title">📅 行程需求（可编辑）</div>
        <span class="badge badge-success">✏️ 可编辑</span>
      </div>
      <div class="mobile-card-body">
        ${itinerary.days.map(day => `
          <div class="mobile-day-item">
            <div class="mobile-day-header">
              <span class="mobile-day-label">Day ${day.day}</span>
              <span style="font-size:11px;color:var(--text-3)">${day.date} · ${day.city}</span>
            </div>
            <div class="mobile-day-content">
              <div style="display:flex;gap:4px;align-items:center;margin-bottom:2px">
                <span style="color:var(--text-3);font-size:11px;width:30px">住宿</span>
                <span contenteditable="true" style="border-bottom:1px dashed var(--border-dark);padding:0 4px;flex:1">${day.hotel || '—'}</span>
              </div>
              <div style="display:flex;gap:4px;align-items:center;margin-bottom:2px">
                <span style="color:var(--text-3);font-size:11px;width:30px">景点</span>
                <span contenteditable="true" style="border-bottom:1px dashed var(--border-dark);padding:0 4px;flex:1">${day.attractions}</span>
              </div>
              <div style="display:flex;gap:4px;align-items:center;margin-bottom:2px">
                <span style="color:var(--text-3);font-size:11px;width:30px">用餐</span>
                <span contenteditable="true" style="border-bottom:1px dashed var(--border-dark);padding:0 4px;flex:1">${day.meals}</span>
              </div>
              <div style="display:flex;gap:4px;align-items:center">
                <span style="color:var(--text-3);font-size:11px;width:30px">交通</span>
                <span contenteditable="true" style="border-bottom:1px dashed var(--border-dark);padding:0 4px;flex:1">${day.transport}</span>
              </div>
            </div>
          </div>
        `).join('')}
        <div style="margin-top:8px;padding:8px;background:var(--success-light);border-radius:4px;font-size:12px;color:#166534">
          ✏️ 您可以直接编辑行程内容（修改酒店、景点、餐饮、交通），编辑后保存并通知一手地接社
        </div>
      </div>
    </div>

    <!-- 行程规划反馈 -->
    <div class="mobile-card">
      <div class="mobile-card-header">
        <div class="mobile-card-title">💡 行程规划反馈</div>
        <span class="badge badge-info">建议</span>
      </div>
      <div class="mobile-card-body">
        <div class="mobile-feedback-row">
          <div class="mobile-feedback-selects">
            <select><option>关联行程</option><option>Day 1</option><option>Day 2</option><option>Day 3</option><option selected>Day 3</option></select>
          </div>
          <textarea style="width:100%;border:1px solid var(--border);border-radius:4px;padding:6px;font-size:13px;min-height:50px" placeholder="行程规划建议...">D3景点安排太满，建议拆分到两天</textarea>
        </div>
        <div class="mobile-feedback-row">
          <div class="mobile-feedback-selects">
            <select><option>关联行程</option><option>Day 5</option></select>
          </div>
          <textarea style="width:100%;border:1px solid var(--border);border-radius:4px;padding:6px;font-size:13px;min-height:50px" placeholder="行程规划建议...">D5酒店位置偏僻，建议换到市区</textarea>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="addFeedbackRow(this)">＋ 添加更多建议</button>
      </div>
    </div>

    <!-- 成本价填写区 -->
    <div class="mobile-card">
      <div class="mobile-card-header">
        <div class="mobile-card-title">💰 成本价填写（按车型）</div>
      </div>
      <div class="mobile-card-body">
        <div class="quote-tabs" style="margin-bottom:8px">
          ${q.carTypes.map(ct => `
            <div class="quote-tab ${state.selectedCarType === ct.key ? 'active' : ''}" onclick="state.selectedCarType='${ct.key}';renderH5Provincial()" style="font-size:12px;padding:4px 10px">
              ${ct.label.replace('商务车','').replace('中巴','')}
            </div>
          `).join('')}
        </div>
        <table class="quote-table" style="font-size:12px">
          <thead><tr><th>项目</th><th class="num">成本价</th><th>备注</th></tr></thead>
          <tbody>
            ${q.items.map(item => `
              <tr>
                <td>${item.label}</td>
                <td class="num input-cell"><input type="number" value="${item.costs[state.selectedCarType] || 0}" style="width:70px;font-size:12px"></td>
                <td style="font-size:11px;color:var(--text-3)">${item.note}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="margin-top:8px;padding:8px;background:var(--price-1-bg);border-radius:4px;display:flex;justify-content:space-between;font-size:13px">
          <span style="font-weight:600;color:var(--price-1)">成本小计</span>
          <span style="font-weight:700;color:var(--price-1)">${fmt(q.items.reduce((s, i) => s + (i.costs[state.selectedCarType] || 0), 0))}</span>
        </div>
        <div style="margin-top:6px;font-size:11px;color:var(--text-3)">
          ⚠ 您填写的成本价仅一手地接社可见，其他省地接社和境外旅行社不可见
        </div>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="mobile-action-bar">
      <button class="mobile-btn mobile-btn-primary" onclick="h5ProvincialSubmit()">📋 保存并通知</button>
    </div>
  `;
}

function h5ProvincialSubmit() {
  showToast('✅', '成本价+行程修改已提交！', '📋 成本摘要：7座¥15,000 / 9座¥17,000 / 14座¥20,000\n📝 行程修改：D3酒店更换、D5景点优化\n📝 行程规划反馈：2条建议\n\n[复制链接通知一手地接社]');
}

/* ============================================
   View: PDF 预览
   ============================================ */
function renderPDFShell() {
  return `
    <div style="height:100vh;background:var(--bg);display:flex;flex-direction:column">
      <header class="pdf-shell-header" style="background:var(--surface);border-bottom:1px solid var(--border);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
          <button class="btn btn-ghost btn-sm" onclick="switchRole('pandaking')">← 返回</button>
          <span style="font-weight:600;font-size:13px">PDF 报价单预览</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div class="role-switcher">
            <button class="${state.pdfLang === 'zh' ? 'active' : ''}" onclick="state.pdfLang='zh';renderPDFPreview()">中文</button>
            <button class="${state.pdfLang === 'th' ? 'active' : ''}" onclick="state.pdfLang='th';renderPDFPreview()">泰语</button>
            <button class="${state.pdfLang === 'bilingual' ? 'active' : ''}" onclick="state.pdfLang='bilingual';renderPDFPreview()">双语</button>
          </div>
          <select class="filter-select" onchange="state.selectedCarType=this.value;renderPDFPreview()">
            <option value="7seat" ${state.selectedCarType==='7seat'?'selected':''}>7座</option>
            <option value="9seat" ${state.selectedCarType==='9seat'?'selected':''}>9座</option>
            <option value="14seat" ${state.selectedCarType==='14seat'?'selected':''}>14座</option>
          </select>
          <select class="filter-select">
            <option>旅行社版</option>
            <option>游客版</option>
            <option>内部版</option>
          </select>
          <button class="btn btn-primary btn-sm" onclick="showToast('📄','PDF下载已开始','文件名：九寨沟8日游_旅行社版_中文.pdf')">⬇ 下载</button>
        </div>
      </header>
      <div style="flex:1;overflow-y:auto" id="pdfContainer"></div>
    </div>`;
}

function renderPDFPreview() {
  const container = $('#pdfContainer');
  if (!container) return;
  const itinerary = MOCK_DATA.itinerary;
  const q = MOCK_DATA.quote;
  const calc = calcQuote(state.selectedCarType);
  const carType = q.carTypes.find(c => c.key === state.selectedCarType);
  const isBilingual = state.pdfLang === 'bilingual';
  const isThai = state.pdfLang === 'th';

  // Thai translations (mock)
  const th = {
    title: "โปรแกรมท่องเที่ยว 8 วัน จิ่วจ้ายโกว",
    customer: "ลูกค้า",
    date: "วันที่เดินทาง",
    pax: "จำนวนผู้เดินทาง",
    itinerary: "โปรแกรมการเดินทาง",
    quote: "ใบเสนอราคา",
    item: "รายการ",
    price: "ราคา",
    total: "รวมทั้งสิ้น",
    note: "หมายเหตุ",
    hotel: "โรงแรม",
    car: "รถตู้พร้อมคนขับ",
    tickets: "ตั๋วเข้าชม",
    service: "ค่าบริการ",
    agencyQuote: "ราคาเสนอบริษัทท่องเที่ยว",
  };

  const days = itinerary.days;

  container.innerHTML = `
    <div class="pdf-frame">
      <div class="pdf-header">
        <div>
          <div class="pdf-logo">🧳 PandaKing Travel</div>
          <div class="pdf-title">${isThai ? th.title : '四川九寨沟8日游 · 行程报价单'}</div>
        </div>
        <div class="pdf-meta">
          <div>客户：John Smith</div>
          <div>旅行社：泰国A旅行社</div>
          <div>出行日期：2026-07-20</div>
          <div>版本：${itinerary.version}</div>
          <div>方案：${carType.label}</div>
          <div>有效期：7天</div>
        </div>
      </div>

      <div class="pdf-section-title">${isThai ? th.itinerary : '行程安排'}</div>
      ${days.map(day => {
        if (isBilingual) {
          return `
            <div class="pdf-itinerary-day">
              <div class="pdf-itinerary-day-header">Day ${day.day} · ${day.date} · ${day.city}</div>
              <div class="pdf-itinerary-day-body">
                <div class="bilingual-row">
                  <div class="bilingual-zh">
                    ${day.hotel ? '🏨 ' + day.hotel + '<br>' : ''}
                    🏞️ ${day.attractions}<br>
                    🍽️ ${day.meals}<br>
                    🚗 ${day.transport}
                  </div>
                  <div class="bilingual-th">
                    ${day.hotel ? '🏨 ' + day.hotel + '<br>' : ''}
                    🏞️ ${day.attractions}<br>
                    🍽️ ${day.meals}<br>
                    🚗 ${day.transport}
                  </div>
                </div>
              </div>
            </div>`;
        }
        return `
          <div class="pdf-itinerary-day">
            <div class="pdf-itinerary-day-header">Day ${day.day} · ${day.date} · ${day.city}</div>
            <div class="pdf-itinerary-day-body">
              ${day.hotel ? '🏨 ' + day.hotel + '<br>' : ''}
              🏞️ ${day.attractions}<br>
              🍽️ ${day.meals}<br>
              🚗 ${day.transport}
            </div>
          </div>`;
      }).join('')}

      <div class="pdf-section-title">${isThai ? th.quote : '报价明细'}</div>
      <table class="pdf-quote-table">
        <thead>
          <tr>
            <th>${isThai ? th.item : '项目'}</th>
            <th class="num">${isThai ? th.price : '金额'}</th>
            <th>${isThai ? th.note : '备注'}</th>
          </tr>
        </thead>
        <tbody>
          ${q.items.filter(i => i.costs[state.selectedCarType] > 0 || i.key === 'experience').map(item => `
            <tr>
              <td>${item.label}</td>
              <td class="num">${fmt(item.costs[state.selectedCarType] || 0)}</td>
              <td style="font-size:12px;color:var(--text-3)">${item.note}</td>
            </tr>
          `).join('')}
          <tr class="pdf-total-row">
            <td>${isThai ? th.agencyQuote : '对旅行社报价（合计）'}</td>
            <td class="num">${fmt(calc.agencyQuote)}</td>
            <td>${carType.label}</td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top:20px;padding:12px;background:var(--surface-alt);border-radius:var(--radius-sm);font-size:12px;color:var(--text-3);line-height:1.8">
        <strong>报价说明：</strong><br>
        1. 报价包含：酒店住宿（含双早）、包车（含司机餐住/油费/过路费）、景区门票（含环保车）、导游服务费<br>
        2. 报价不包含：国际机票、个人消费、旅游保险、签证费用<br>
        3. 报价有效期7天，超过有效期需重新确认<br>
        4. 行程可根据游客需求调整，价格相应变动<br>
        ${isBilingual ? '5. 本报价单为中泰双语对照版，方便游客确认行程' : ''}
      </div>

      <div class="pdf-footer">
        PandaKing Travel · 随程国际旅行社 · 电话：+86-28-XXXXXXX · 邮箱：info@pandaking9.com<br>
        本报价单由系统自动生成 · 版本 ${itinerary.version} · 生成时间 2026-07-09
      </div>
    </div>
  `;
}

/* ============================================
   View: 案例展示 (Cases · Phase 2 / Later 规划)
   ============================================ */
function renderCases() {
  const content = $('#content');
  let cases = [...MOCK_DATA.cases];
  if (state.caseFilter !== 'all') cases = cases.filter(c => c.tags.includes(state.caseFilter));

  const statusLabel = (s) => s === 'published' ? '已发布' : s === 'draft' ? '草稿' : '已下线';
  const statusClass = (s) => s === 'published' ? 'published' : s === 'draft' ? 'draft' : 'offline';

  content.innerHTML = `
    <div class="notice-banner info-banner">
      <span>🌟</span>
      <span><strong>案例展示</strong> 是获客·宣传闭环模块（<strong>Phase 2 / Later</strong> 规划）。当前为原型示意：已交付行程脱敏后沉淀为可分享作品集，对外生成<strong>公开 H5 + 二维码 + 海报</strong>，在微信传播种草获客。合规硬约束：客户真名 / 证件 / 精确出行日期 / 合同价均不公开。</span>
    </div>

    <div class="cases-toolbar">
      <button class="btn btn-primary" onclick="showToast('🌟','发布为案例（Phase 2）','此功能将在 Phase 2 上线：路线详情「发布为案例」→ 选封面 / 写卖点 / 自动脱敏 → 生成可分享 H5')">＋ 发布案例</button>
      <div class="filter-group">
        <select class="filter-select ${state.caseFilter !== 'all' ? 'active' : ''}" onchange="state.caseFilter=this.value;renderCases()">
          <option value="all" ${state.caseFilter==='all'?'selected':''}>全部主题</option>
          <option value="自然风光" ${state.caseFilter==='自然风光'?'selected':''}>自然风光</option>
          <option value="文化体验" ${state.caseFilter==='文化体验'?'selected':''}>文化体验</option>
          <option value="美食之旅" ${state.caseFilter==='美食之旅'?'selected':''}>美食之旅</option>
        </select>
      </div>
      <div style="flex:1"></div>
      <div class="case-loop-hint">📈 获客 → 定制 → 服务 → 宣传 闭环：案例 H5 种草 → 咨询生成新线索路线 → 三方协作交付 → 完成行程「发布为案例」</div>
    </div>

    <div class="case-grid">
      ${cases.map(c => `
        <div class="case-card">
          <div class="case-cover" style="background:${c.cover}">
            <span class="case-days">${c.days}天${c.nights}晚</span>
            <span class="case-status ${statusClass(c.status)}">${statusLabel(c.status)}</span>
          </div>
          <div class="case-body">
            <div class="case-title">${c.title}</div>
            <div class="case-dest">📍 ${c.destination}</div>
            <div class="case-tags">${c.tags.map(t=>`<span class="badge badge-info">${t}</span>`).join('')}</div>
            <div class="case-highlight">✨ ${c.highlight}</div>
            <div class="case-meta">
              <span>参考 ${c.priceRange}</span>
            </div>
            <div class="case-stats">
              <span>👁 ${c.views}</span>
              <span>↗ ${c.shares}</span>
            </div>
            <div class="case-actions">
              <button class="btn btn-secondary btn-sm" onclick="showToast('🔗','公开H5链接（示意）','https://case.pandaking.com/${c.id} — 微信免登录即可浏览脱敏作品集')">🔗 查看H5</button>
              <button class="btn btn-ghost btn-sm" onclick="showToast('📱','二维码（示意）','微信扫码即可在手机端查看公开案例作品集，可长按保存分享')">📱 二维码</button>
            </div>
          </div>
        </div>
      `).join('')}
    </div>

    ${cases.length === 0 ? `
      <div class="empty-state">
        <div class="icon">🌟</div>
        <div>该主题下暂无案例</div>
      </div>
    ` : ''}
  `;
}

/* ============================================
   Init
   ============================================ */
function init() {
  // Update mobile time
  setInterval(() => {
    const el = $('#mobileTime');
    if (el) {
      const now = new Date();
      el.textContent = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
    }
  }, 1000);

  // Re-render on orientation change / significant resize
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    // Only re-render if crossing the mobile/desktop boundary
    if ((w <= 768) !== (lastWidth <= 768)) {
      lastWidth = w;
      state.sidebarOpen = false;
      render();
    }
    lastWidth = w;
  });

  render();
}

// Start
init();
