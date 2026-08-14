// PandaKing9 平台品牌（匿名无 via 时的兜底展示；有 via 时被旅行社品牌覆盖）
// 联系方式在此维护（产品配置，2026-08-14）
import type { AgencyBranding } from '@/types'

export const PANDKING_BRAND: AgencyBranding = {
  id: 'pandaking9',
  name: 'PandaKing9',
  logoUrl: null,
  contacts: [
    { platform: 'wechat', value: 'wx2754978' },
  ],
}
