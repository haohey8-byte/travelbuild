import { createI18n } from 'vue-i18n'

// 四语最小字典（EN/ZH/TH/RU），后续按 doc 扩字段
const messages = {
  zh: {
    nav: { routes: '路线管理', kb: '知识库', account: '账号', cases: '案例展示' },
    common: { role: '角色', loading: '加载中…', empty: '暂无数据' },
  },
  en: {
    nav: { routes: 'Routes', kb: 'Knowledge', account: 'Account', cases: 'Cases' },
    common: { role: 'Role', loading: 'Loading…', empty: 'No data' },
  },
  th: {
    nav: { routes: 'เส้นทาง', kb: 'ความรู้', account: 'บัญชี', cases: 'เคส' },
    common: { role: 'บทบาท', loading: 'กำลังโหลด…', empty: 'ไม่มีข้อมูล' },
  },
  ru: {
    nav: { routes: 'Маршруты', kb: 'База', account: 'Аккаунт', cases: 'Кейсы' },
    common: { role: 'Роль', loading: 'Загрузка…', empty: 'Нет данных' },
  },
}

export default createI18n({
  legacy: false,
  locale: localStorage.getItem('locale') || 'zh',
  fallbackLocale: 'zh',
  messages,
})
