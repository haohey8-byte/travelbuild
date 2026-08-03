import client from './client'
import type { CaseItem } from '@/types'

// 案例展示 —— 对应 doc/04-接口契约/H5协作链接.md 与 案例.md
export async function fetchCases(): Promise<CaseItem[]> {
  const { data } = await client.get('/cases')
  return data
}

// 管理端列表：全量（含草稿/下线）—— 案例中心管理视角（新建空白/派生的草稿必须可见）
export async function fetchCasesManage(): Promise<CaseItem[]> {
  const { data } = await client.get('/cases/manage/all')
  return data
}

// 从已确认路线派生案例（服务端做脱敏校验）
export async function createCaseFromRoute(routeId: string): Promise<CaseItem> {
  const { data } = await client.post(`/cases/from-route/${routeId}`)
  return data
}

export async function fetchCase(id: string, via?: string): Promise<CaseItem> {
  const { data } = await client.get(`/cases/${id}`, { params: via ? { via } : undefined })
  return data
}

// 管理端：单个案例（含草稿/下线）—— 草稿案例编辑入口
export async function fetchCaseManage(id: string): Promise<CaseItem> {
  const { data } = await client.get(`/cases/manage/${id}`)
  return data
}

// 可见性单查（登录态）：已发布或归属自己，与管理权限解耦；用于详情页打开，根治非归属 agency 打开即 403
export async function fetchCaseView(id: string, via?: string): Promise<CaseItem> {
  const { data } = await client.get(`/cases/view/${id}`, { params: via ? { via } : undefined })
  return data
}

// 管理端：新建空白案例（最少字段，其余后补）
export async function createCase(payload: Partial<CaseItem>): Promise<CaseItem> {
  const { data } = await client.post('/cases', payload)
  return data
}

// 管理端：导入 HTML 微站直接创建草稿（后端 sanitize + 抽 h1 标题）
export async function importCaseHtml(html: string): Promise<CaseItem> {
  const { data } = await client.post('/cases/import-html', { html })
  return data
}

export async function publishCase(id: string): Promise<CaseItem> {
  const { data } = await client.post(`/cases/${id}/publish`)
  return data
}

// 管理端：AI 机器翻译（中文 → en/th，标记 machine；fields 指定翻译模块，不传=翻译全部）
// source 可选：传入当前编辑态表单中的中文源内容，优先于数据库旧值作为翻译源
// 整体页面翻译模块：title/desc/highlights/daysContent/contentHtml
export async function translateCase(
  id: string,
  fields?: string[],
  source?: {
    title?: string
    descZh?: string
    highlights?: string[]
    daysContent?: any[]
    contentHtml?: string
  },
): Promise<CaseItem> {
  const { data } = await client.post(`/cases/${id}/translate`, { fields, source })
  return data
}

export async function unpublishCase(id: string): Promise<CaseItem> {
  const { data } = await client.post(`/cases/${id}/unpublish`)
  return data
}

export async function updateCase(id: string, payload: Partial<CaseItem>): Promise<CaseItem> {
  const { data } = await client.put(`/cases/${id}`, payload)
  return data
}

export async function deleteCase(id: string): Promise<void> {
  await client.delete(`/cases/${id}`)
}
