/* ============================================
   模拟数据 — 入境游定制协作工作台原型
   ============================================ */

const MOCK_DATA = {

  /* ---- 当前用户 ---- */
  currentUser: {
    name: "张运营",
    role: "一手地接社运营",
    org: "PandaKing",
    avatar: "张",
  },

  /* ---- 多路线看板数据 ---- */
  routes: [
    {
      id: "C2026-001", customer: "John Smith", customerCn: "约翰·史密斯",
      agency: "泰国A旅行社", destination: "四川九寨沟8日游",
      version: "v3", status: "待反馈", statusKey: "awaiting_feedback",
      mode: "自行模式", modeKey: "self",
      lastAction: "3天前", lastActionHours: 72, urgent: "danger",
      todo: "待你修改行程", todoType: "self_edit",
      groupSize: 5, travelDate: "2026-07-20",
    },
    {
      id: "C2026-002", customer: "Maria Garcia", customerCn: "玛丽亚·加西亚",
      agency: "泰和旅游", destination: "云南大理5日游",
      version: "v2", status: "待报价", statusKey: "awaiting_quote",
      mode: "协作模式", modeKey: "collab",
      lastAction: "1天前", lastActionHours: 26, urgent: "danger",
      todo: "待省地接社回复成本", todoType: "await_provincial",
      groupSize: 8, travelDate: "2026-08-05",
    },
    {
      id: "C2026-003", customer: "Kim Lee", customerCn: "金李",
      agency: "环球假期", destination: "新疆喀什6日游",
      version: "v1", status: "待确认", statusKey: "awaiting_confirm",
      mode: "协作模式", modeKey: "collab",
      lastAction: "6小时前", lastActionHours: 6, urgent: "normal",
      todo: "待旅行社确认报价", todoType: "await_agency_confirm",
      groupSize: 12, travelDate: "2026-07-25",
    },
    {
      id: "C2026-004", customer: "Tanaka Yuki", customerCn: "田中由纪",
      agency: "东方之旅", destination: "北京故宫4日游",
      version: "v1", status: "已确认", statusKey: "confirmed",
      mode: "自行模式", modeKey: "self",
      lastAction: "2小时前", lastActionHours: 2, urgent: "normal",
      todo: "", todoType: "none",
      groupSize: 3, travelDate: "2026-07-15",
    },
    {
      id: "C2026-005", customer: "David Brown", customerCn: "大卫·布朗",
      agency: "泰国A旅行社", destination: "西藏拉萨7日游",
      version: "v4", status: "已流失", statusKey: "lost",
      mode: "协作模式", modeKey: "collab",
      lastAction: "5天前", lastActionHours: 120, urgent: "lost",
      todo: "", todoType: "none",
      groupSize: 6, travelDate: "2026-06-30",
    },
    {
      id: "C2026-006", customer: "Anna Schmidt", customerCn: "安娜·施密特",
      agency: "环球假期", destination: "四川稻城亚丁6日游",
      version: "v2", status: "待报价", statusKey: "awaiting_quote",
      mode: "自行模式", modeKey: "self",
      lastAction: "1天前", lastActionHours: 22, urgent: "warning",
      todo: "待你出报价", todoType: "self_quote",
      groupSize: 4, travelDate: "2026-08-10",
    },
    {
      id: "C2026-007", customer: "Somchai Wattana", customerCn: "颂猜·瓦塔纳",
      agency: "泰国A旅行社", destination: "成都+乐山+峨眉5日游",
      version: "v2", status: "待反馈", statusKey: "awaiting_feedback",
      mode: "自行模式", modeKey: "self",
      lastAction: "12小时前", lastActionHours: 12, urgent: "normal",
      todo: "待旅行社反馈", todoType: "await_agency_feedback",
      groupSize: 7, travelDate: "2026-07-28",
    },
    {
      id: "C2026-008", customer: "Park Jiyeon", customerCn: "朴智妍",
      agency: "东方之旅", destination: "云南香格里拉7日游",
      version: "v1", status: "待确认", statusKey: "awaiting_confirm",
      mode: "协作模式", modeKey: "collab",
      lastAction: "8小时前", lastActionHours: 8, urgent: "normal",
      todo: "待旅行社加价", todoType: "await_agency_markup",
      groupSize: 10, travelDate: "2026-08-15",
    },
    {
      id: "C2026-009", customer: "James Wilson", customerCn: "詹姆斯·威尔逊",
      agency: "泰国A旅行社", destination: "四川成都+九寨沟7日游",
      version: "v1", status: "待一手确认", statusKey: "await_primary_confirm",
      mode: "自行模式", modeKey: "self",
      lastAction: "30分钟前", lastActionHours: 0.5, urgent: "normal",
      todo: "待你确认/反馈旅行社草案", todoType: "await_primary_confirm",
      groupSize: 6, travelDate: "2026-08-20",
    },
    {
      id: "C2026-010", customer: "Emma Davis", customerCn: "艾玛·戴维斯",
      agency: "环球假期", destination: "贵州黄果树5日游",
      version: "v1", status: "待旅行社修订", statusKey: "await_agency_revision",
      mode: "自行模式", modeKey: "self",
      lastAction: "1小时前", lastActionHours: 1, urgent: "normal",
      todo: "一手已回传修改反馈", todoType: "await_agency_revision",
      groupSize: 4, travelDate: "2026-08-12",
    },
  ],

  /* ---- 客户档案列表 ---- */
  customers: [
    { id: "C2026-001", nameEn: "John Smith", nameCn: "约翰·史密斯", country: "美国", contact: "john@email.com", groupSize: 5, travelDate: "2026-07-20", destination: "四川九寨沟8日游", agency: "泰国A旅行社", status: "待反馈", mode: "自行模式", createTime: "2026-07-01", hasInitialPlan: true },
    { id: "C2026-002", nameEn: "Maria Garcia", nameCn: "玛丽亚·加西亚", country: "西班牙", contact: "maria@email.com", groupSize: 8, travelDate: "2026-08-05", destination: "云南大理5日游", agency: "泰和旅游", status: "待报价", mode: "协作模式", createTime: "2026-07-03", hasInitialPlan: false },
    { id: "C2026-003", nameEn: "Kim Lee", nameCn: "金李", country: "韩国", contact: "kim@email.com", groupSize: 12, travelDate: "2026-07-25", destination: "新疆喀什6日游", agency: "环球假期", status: "待确认", mode: "协作模式", createTime: "2026-06-25", hasInitialPlan: true },
    { id: "C2026-004", nameEn: "Tanaka Yuki", nameCn: "田中由纪", country: "日本", contact: "tanaka@email.com", groupSize: 3, travelDate: "2026-07-15", destination: "北京故宫4日游", agency: "东方之旅", status: "已确认", mode: "自行模式", createTime: "2026-06-28", hasInitialPlan: false },
    { id: "C2026-005", nameEn: "David Brown", nameCn: "大卫·布朗", country: "英国", contact: "david@email.com", groupSize: 6, travelDate: "2026-06-30", destination: "西藏拉萨7日游", agency: "泰国A旅行社", status: "已流失", mode: "协作模式", createTime: "2026-06-10", hasInitialPlan: false },
    { id: "C2026-006", nameEn: "Anna Schmidt", nameCn: "安娜·施密特", country: "德国", contact: "anna@email.com", groupSize: 4, travelDate: "2026-08-10", destination: "四川稻城亚丁6日游", agency: "环球假期", status: "待报价", mode: "自行模式", createTime: "2026-07-05", hasInitialPlan: true },
    { id: "C2026-007", nameEn: "Somchai Wattana", nameCn: "颂猜·瓦塔纳", country: "泰国", contact: "somchai@email.com", groupSize: 7, travelDate: "2026-07-28", destination: "成都+乐山+峨眉5日游", agency: "泰国A旅行社", status: "待反馈", mode: "自行模式", createTime: "2026-07-02", hasInitialPlan: false },
    { id: "C2026-008", nameEn: "Park Jiyeon", nameCn: "朴智妍", country: "韩国", contact: "park@email.com", groupSize: 10, travelDate: "2026-08-15", destination: "云南香格里拉7日游", agency: "东方之旅", status: "待确认", mode: "协作模式", createTime: "2026-06-30", hasInitialPlan: true },
    { id: "C2026-009", nameEn: "James Wilson", nameCn: "詹姆斯·威尔逊", country: "美国", contact: "james@email.com", groupSize: 6, travelDate: "2026-08-20", destination: "四川成都+九寨沟7日游", agency: "泰国A旅行社", status: "待一手确认", mode: "自行模式", createTime: "2026-07-08", hasInitialPlan: true },
    { id: "C2026-010", nameEn: "Emma Davis", nameCn: "艾玛·戴维斯", country: "英国", contact: "emma@email.com", groupSize: 4, travelDate: "2026-08-12", destination: "贵州黄果树5日游", agency: "环球假期", status: "待旅行社修订", mode: "自行模式", createTime: "2026-07-06", hasInitialPlan: true },
  ],

  /* ---- 行程数据（以 C2026-001 为详细示例） ---- */
  itinerary: {
    customerId: "C2026-001",
    customerName: "John Smith",
    routeName: "四川九寨沟8日游",
    version: "v3",
    mode: "自行模式",
    draft: false, // 草稿态：编辑即存草稿，保存并通知才转正
    days: [
      { day: 1, date: "7/15", city: "成都", hotel: "成都香格里拉大酒店", attractions: "抵达双流机场，专车接机", meals: "晚餐：欢迎晚宴（川菜）", transport: "7座商务车接机", hasFeedback: false },
      { day: 2, date: "7/16", city: "成都→九寨沟", hotel: "九寨沟希尔顿度假酒店", attractions: "沿途观赏岷江峡谷风光，叠溪海子", meals: "早：酒店 / 午：茂县羌餐 / 晚：酒店自助", transport: "7座商务车（约7小时）", hasFeedback: false },
      { day: 3, date: "7/17", city: "九寨沟", hotel: "九寨沟希尔顿度假酒店", attractions: "九寨沟全天游览（树正沟→日则沟→则查洼沟）", meals: "早：酒店 / 午：沟内自助 / 晚：藏式火锅", transport: "景区环保车", hasFeedback: true, feedbackContent: "D3酒店太贵了，建议换¥800以内的" },
      { day: 4, date: "7/18", city: "九寨沟→黄龙→茂县", hotel: "茂县国际酒店", attractions: "黄龙风景区（五彩池、迎宾池）", meals: "早：酒店 / 午：川主寺 / 晚：茂县", transport: "7座商务车", hasFeedback: false },
      { day: 5, date: "7/19", city: "茂县→都江堰→成都", hotel: "成都香格里拉大酒店", attractions: "都江堰水利工程、青城山（前山）", meals: "早：酒店 / 午：都江堰 / 晚：成都火锅", transport: "7座商务车", hasFeedback: true, feedbackContent: "D5自由活动可以加一个特色体验项目" },
      { day: 6, date: "7/20", city: "成都", hotel: "成都香格里拉大酒店", attractions: "大熊猫繁育基地、武侯祠、锦里古街", meals: "早：酒店 / 午：成都小吃 / 晚：自由活动", transport: "7座商务车", hasFeedback: false },
      { day: 7, date: "7/21", city: "成都→乐山→成都", hotel: "成都香格里拉大酒店", attractions: "乐山大佛、凌云寺", meals: "早：酒店 / 午：乐山 / 晚：成都", transport: "7座商务车", hasFeedback: false },
      { day: 8, date: "7/22", city: "成都→返程", hotel: "", attractions: "宽窄巷子自由购物，专车送机", meals: "早：酒店", transport: "7座商务车送机", hasFeedback: false },
    ],
  },

  /* ---- 报价数据 ---- */
  quote: {
    customerId: "C2026-001",
    carTypes: [
      { key: "7seat", label: "7座商务车", seats: 7, recommended: true },
      { key: "9seat", label: "9座商务车", seats: 9, recommended: false },
      { key: "14seat", label: "14座中巴", seats: 14, recommended: false },
    ],
    items: [
      { key: "hotel", label: "酒店（7晚）", unit: "7晚", note: "五星级，含双早", needsUpdate: false,
        costs: { "7seat": 6000, "9seat": 6000, "14seat": 6000 } },
      { key: "car", label: "包车（8天）", unit: "8天", note: "含司机餐住、油费、过路费", needsUpdate: false,
        costs: { "7seat": 4000, "9seat": 6000, "14seat": 9000 } },
      { key: "tickets", label: "门票", unit: "", note: "含景区环保车", needsUpdate: false,
        costs: { "7seat": 3000, "9seat": 3000, "14seat": 3000 } },
      { key: "service", label: "服务费", unit: "", note: "含导游服务", needsUpdate: false,
        costs: { "7seat": 2000, "9seat": 2000, "14seat": 2000 } },
      { key: "experience", label: "特色体验", unit: "", note: "藏式文化体验+火锅", needsUpdate: true,
        costs: { "7seat": 0, "9seat": 0, "14seat": 0 } },
    ],
    // 利润设置
    profit: { mode: "amount", value: 5000, label: "按固定金额" },
    // 旅行社加价（一手地接社只读）
    agencyMarkup: { mode: "amount", value: 3000, label: "按固定金额" },
    // 旅行社是否已加价
    agencyMarkedUp: true,
    // 旅行社确认的车型
    confirmedCarType: "9seat",
    // 利润表达模式：'decompose' 成本+利润分解 | 'bundled' 含利润直接报价
    priceMode: "decompose",
    // 模式B（含利润直接报价）：对一手报价(含利润)按车型直接录入，利润=③-①反算
    bundledPrice: { "7seat": 20000, "9seat": 22000, "14seat": 25000 },
  },

  /* ---- 沟通记录 ---- */
  communications: [
    { time: "2026-07-09 14:30", type: "save_notify", title: "v3 行程报价已保存并通知", desc: "一手地接社运营 张运营 保存并通知 → H5链接已复制到剪贴板 → 已粘贴到微信通知泰国A旅行社", icon: "save", color: "brand" },
    { time: "2026-07-09 10:15", type: "feedback", title: "旅行社反馈修改意见（3条）", desc: "泰国A旅行社 Somchai 提交反馈：①D3酒店太贵，建议换¥800以内的（关联行程Day3+报价酒店行）②包车7座方案可以接受（关联报价包车行）③D5自由活动可加特色体验（关联行程Day5）", icon: "feedback", color: "warning" },
    { time: "2026-07-08 16:00", type: "link_open", title: "旅行社打开H5链接", desc: "泰国A旅行社 Somchai 在微信内打开v2行程报价H5链接，查看时长3分25秒，查看了7座和9座车型方案对比", icon: "open", color: "info" },
    { time: "2026-07-08 15:30", type: "save_notify", title: "v2 行程报价已保存并通知", desc: "一手地接社运营 张运营 保存并通知 → D3酒店升级为希尔顿；新增D8返程日；报价7座¥17,250起 → H5链接已复制", icon: "save", color: "brand" },
    { time: "2026-07-06 11:00", type: "version", title: "v1 行程报价单创建", desc: "从「九寨沟8日经典线」模板创建，自行模式，填写成本价+设置利润", icon: "create", color: "success" },
    { time: "2026-07-05 14:00", type: "customer_create", title: "客户档案创建", desc: "泰国A旅行社 Somchai 创建客户档案：John Smith，美国，5人，2026-07-20出行，目的地四川九寨沟", icon: "create", color: "success" },
    { time: "2026-07-05 13:30", type: "initial_plan", title: "初步行程需求提交", desc: "泰国A旅行社 Somchai 提交初步行程需求：D1抵达成都，D2-D3九寨沟，D4黄龙，D5-D6成都周边，D7乐山，D8返程；游客偏好五星级酒店；预算中等", icon: "plan", color: "info" },
    { time: "2026-07-05 13:00", type: "account", title: "旅行社销售加入系统", desc: "泰国A旅行社管理者邀请 Somchai → 微信授权登录 → 直接获得权限", icon: "account", color: "success" },
  ],

  /* ---- 知识库 ---- */
  knowledgeBase: [
    { id: "KB001", category: "签证", question: "泰国游客来中国需要签证吗？", answer: "泰国普通护照持有人可免签入境中国停留不超过30天。需准备：护照（6个月以上有效期）、返程机票、酒店预订单。", tags: ["签证", "泰国"], views: 156 },
    { id: "KB002", category: "签证", question: "美国游客中国签证类型和办理时间？", answer: "美国游客需申请L签证（旅游签证），办理时间4-5个工作日。需提供：护照、照片、邀请函或酒店/机票预订单。有效期10年多次往返。", tags: ["签证", "美国"], views: 203 },
    { id: "KB003", category: "交通", question: "九寨沟包车7座和9座价格差异大吗？", answer: "7座别克GL8约¥800/天，9座丰田海狮约¥1,200/天。8天行程差价约¥3,200。5人建议7座即可，6人以上建议9座。", tags: ["包车", "九寨沟", "报价"], views: 89 },
    { id: "KB004", category: "酒店", question: "九寨沟希尔顿和假日酒店的区别？", answer: "希尔顿度假酒店：五星级，位于九寨沟景区入口附近，¥850-1200/晚，含双早。假日酒店：四星级，位于漳扎镇，¥450-650/晚。建议高端客户选希尔顿。", tags: ["酒店", "九寨沟"], views: 134 },
    { id: "KB005", category: "行程", question: "九寨沟一天能逛完吗？需要几天？", answer: "九寨沟推荐1.5-2天。Day1：树正沟+日则沟（精华路线）；Day2：则查洼沟+查沟（深度游）。1天可走完主要景点但较赶。", tags: ["行程", "九寨沟"], views: 178 },
    { id: "KB006", category: "餐饮", question: "藏式火锅人均消费多少？", answer: "九寨沟藏式火锅人均¥120-180。推荐如意林卡藏餐，环境好味道正。可提前预订。", tags: ["餐饮", "九寨沟"], views: 67 },
    { id: "KB007", category: "报价", question: "旅行社加价一般多少合适？", answer: "泰国旅行社一般加价5-15%（或固定¥2000-5000）。根据线路热度和客户预算调整。高端线路加价空间更大。", tags: ["报价", "旅行社"], views: 245 },
    { id: "KB008", category: "行程", question: "黄龙景区高反严重吗？需要准备什么？", answer: "黄龙海拔3500-3900m，部分游客会有轻微高反。建议：提前1天到成都适应（海拔500m）、携带氧气瓶（景区可租）、慢行、不要剧烈运动。", tags: ["行程", "黄龙", "安全"], views: 198 },
    { id: "KB009", category: "交通", question: "成都双流机场到市区多远？", answer: "双流机场距市中心约16km，打车约40分钟¥80-100。7座商务车接机约¥200。地铁10号线可到市区。", tags: ["交通", "成都"], views: 112 },
    { id: "KB010", category: "签证", question: "韩国游客免签政策？", answer: "韩国普通护照持有人可免签入境中国停留不超过30天（2025年11月起恢复）。需准备：护照、返程机票、住宿证明。", tags: ["签证", "韩国"], views: 87 },
  ],

  /* ---- 账号管理 ---- */
  accounts: {
    "pandaking": {
      name: "PandaKing（一手地接社）",
      members: [
        { name: "张运营", role: "一手地接社运营", status: "active", joinDate: "2026-01-15", lastLogin: "2小时前" },
        { name: "李运营", role: "一手地接社运营", status: "active", joinDate: "2026-01-20", lastLogin: "1天前" },
        { name: "王管理", role: "一手地接社管理者", status: "active", joinDate: "2026-01-01", lastLogin: "30分钟前" },
      ],
    },
    "thai-a": {
      name: "泰国A旅行社",
      members: [
        { name: "Somchai", role: "旅行社销售", status: "active", joinDate: "2026-07-05", lastLogin: "1小时前" },
        { name: "Niran", role: "旅行社销售", status: "active", joinDate: "2026-07-05", lastLogin: "3小时前" },
        { name: "Pravit", role: "旅行社管理者", status: "active", joinDate: "2026-07-01", lastLogin: "2天前" },
      ],
    },
    "taihe": {
      name: "泰和旅游",
      members: [
        { name: "陈经理", role: "旅行社管理者", status: "active", joinDate: "2026-06-20", lastLogin: "5小时前" },
      ],
    },
    "huanqiu": {
      name: "环球假期",
      members: [
        { name: "Mike", role: "旅行社销售", status: "active", joinDate: "2026-06-15", lastLogin: "6小时前" },
        { name: "Sarah", role: "旅行社管理者", status: "active", joinDate: "2026-06-10", lastLogin: "1天前" },
      ],
    },
    "dongfang": {
      name: "东方之旅",
      members: [
        { name: "刘经理", role: "旅行社管理者", status: "active", joinDate: "2026-06-01", lastLogin: "4小时前" },
      ],
    },
    "xinjiang-a": {
      name: "新疆A旅行社",
      members: [
        { name: "阿依古丽", role: "省地接社运营", status: "active", joinDate: "2026-06-25", lastLogin: "8小时前" },
        { name: "马经理", role: "省地接社管理者", status: "active", joinDate: "2026-06-20", lastLogin: "1天前" },
      ],
    },
    "sichuan": {
      name: "四川地接社",
      members: [
        { name: "小王", role: "省地接社运营", status: "active", joinDate: "2026-06-28", lastLogin: "12小时前" },
      ],
    },
    "yunnan": {
      name: "云南地接社",
      members: [
        { name: "阿鹏", role: "省地接社运营", status: "active", joinDate: "2026-07-01", lastLogin: "2天前" },
        { name: "金花", role: "省地接社管理者", status: "active", joinDate: "2026-06-30", lastLogin: "3天前" },
      ],
    },
  },

  /* ---- 线路模板库 ---- */
  templates: [
    { id: "T001", name: "九寨沟8日经典线", days: 8, destinations: ["成都", "九寨沟", "黄龙", "都江堰", "乐山"], useCount: 23, lastUsed: "2026-07-06" },
    { id: "T002", name: "云南大理+丽江6日", days: 6, destinations: ["昆明", "大理", "丽江"], useCount: 18, lastUsed: "2026-07-03" },
    { id: "T003", name: "新疆喀什深度6日", days: 6, destinations: ["喀什", "塔县", "帕米尔高原"], useCount: 8, lastUsed: "2026-06-25" },
    { id: "T004", name: "西藏拉萨7日朝圣", days: 7, destinations: ["拉萨", "林芝", "羊湖"], useCount: 12, lastUsed: "2026-06-15" },
    { id: "T005", name: "北京故宫4日文化游", days: 4, destinations: ["北京"], useCount: 31, lastUsed: "2026-06-28" },
    { id: "T006", name: "稻城亚丁6日探险", days: 6, destinations: ["成都", "稻城", "亚丁"], useCount: 9, lastUsed: "2026-07-05" },
  ],

  /* ---- 统计数据 ---- */
  stats: {
    totalRoutes: 10,
    awaitingQuote: 2,
    awaitingFeedback: 2,
    awaitingConfirm: 2,
    awaitPrimaryConfirm: 2,
    awaitAgencyRevision: 1,
    confirmed: 1,
    lost: 1,
    overdue: 2,
    monthlyOrders: 42,
    avgCycleDays: 5.2,
    h5OpenRate: "82%",
    selfModeRate: "45%",
  },

  /* ---- 案例展示（获客·宣传闭环 / Phase 2 规划模块）--- */
  /* 说明：已交付/已确认行程脱敏后沉淀为可分享作品集，对外生成公开 H5 + 二维码 + 海报
     字段均为脱敏后的展示数据：真名/证件/精确日期/合同价不公开（合规约束） */
  cases: [
    { id: "C-001", title: "九寨沟·童话世界8日", destination: "四川九寨沟", days: 8, nights: 7, status: "published",
      cover: "linear-gradient(135deg,#1e88e5,#6ab7ff)", tags: ["自然风光", "亲子"],
      highlight: "黄龙 + 九寨沟 + 都江堰，含藏式火锅特色体验", priceRange: "¥8,000-12,000/人", views: 1280, shares: 96 },
    { id: "C-002", title: "云南大理丽江慢生活6日", destination: "云南大理·丽江", days: 6, nights: 5, status: "published",
      cover: "linear-gradient(135deg,#43a047,#9ccc65)", tags: ["文化体验", "摄影"],
      highlight: "洱海骑行 + 玉龙雪山 + 古城慢游", priceRange: "¥5,500-8,000/人", views: 2103, shares: 178 },
    { id: "C-003", title: "新疆喀什秘境6日", destination: "新疆喀什", days: 6, nights: 5, status: "published",
      cover: "linear-gradient(135deg,#fb8c00,#ffb74d)", tags: ["自然风光", "探险"],
      highlight: "帕米尔高原 + 塔县 + 喀什老城人文", priceRange: "¥9,000-13,000/人", views: 864, shares: 52 },
    { id: "C-004", title: "北京故宫文化4日", destination: "北京", days: 4, nights: 3, status: "draft",
      cover: "linear-gradient(135deg,#8e24aa,#ba68c8)", tags: ["文化体验", "历史"],
      highlight: "故宫 + 长城 + 胡同深度讲解", priceRange: "¥4,000-6,500/人", views: 0, shares: 0 },
    { id: "C-005", title: "稻城亚丁·蓝色星球6日", destination: "四川稻城亚丁", days: 6, nights: 5, status: "published",
      cover: "linear-gradient(135deg,#00897b,#4db6ac)", tags: ["自然风光", "徒步"],
      highlight: "牛奶海 + 五色海 + 香格里拉镇", priceRange: "¥7,000-10,000/人", views: 1520, shares: 134 },
    { id: "C-006", title: "西藏拉萨朝圣7日", destination: "西藏拉萨", days: 7, nights: 6, status: "offline",
      cover: "linear-gradient(135deg,#3949ab,#7986cb)", tags: ["文化体验", "信仰"],
      highlight: "布达拉宫 + 羊湖 + 林芝桃花", priceRange: "¥8,500-12,000/人", views: 430, shares: 21 },
  ],
};

// 车型报价参考表
const CAR_TYPE_REFERENCE = [
  { type: "7座商务车", seats: "2-5人", costPerDay: 800, level: "别克GL8等级" },
  { type: "9座商务车", seats: "6-8人", costPerDay: 1200, level: "丰田海狮等级" },
  { type: "14座中巴", seats: "9-13人", costPerDay: 1800, level: "考斯特等级" },
  { type: "22座中巴", seats: "14-20人", costPerDay: 2500, level: "可扩展" },
  { type: "35座大巴", seats: "21人+", costPerDay: 3500, level: "可扩展" },
];
