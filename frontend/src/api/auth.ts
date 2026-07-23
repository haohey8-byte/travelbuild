import client from './client'
import type {
  LoginResult,
  User,
  Role,
  Invite,
  Agency,
  AgencyView,
  AdminView,
} from '@/types'

// 认证 —— 对应 doc/04-接口契约/账号与认证.md
export async function devLogin(role: Role): Promise<LoginResult> {
  const { data } = await client.post('/auth/dev-login', { role })
  return data
}

// 手机号 + 密码登录（管理员）
export async function login(phone: string, password: string): Promise<LoginResult> {
  const { data } = await client.post('/auth/login', { phone, password })
  return data
}

// 改密（含首次强制改密，需登录态）
export async function changePwd(oldPwd: string, newPwd: string): Promise<{ ok: boolean; user: User }> {
  const { data } = await client.post('/auth/change-pwd', { oldPwd, newPwd })
  return data
}

// 管理员列表（手机号脱敏，限 pandaking）
export async function fetchAdmins(): Promise<AdminView[]> {
  const { data } = await client.get('/auth/admins')
  return data
}

// 新增管理员
export async function createAdmin(body: {
  name: string
  phone: string
  initPwd: string
}): Promise<AdminView> {
  const { data } = await client.post('/auth/admins', body)
  return data
}

// 重置管理员密码
export async function resetAdminPwd(id: string, initPwd: string): Promise<void> {
  await client.post(`/auth/admins/${id}/reset-pwd`, { initPwd })
}

// 禁用 / 启用管理员
export async function disableAdmin(id: string): Promise<void> {
  await client.post(`/auth/admins/${id}/disable`)
}

export async function acceptInvite(token: string, name: string): Promise<LoginResult> {
  const { data } = await client.post('/auth/accept-invite', { token, name })
  return data
}

export async function fetchMe(): Promise<User> {
  const { data } = await client.get('/auth/me')
  return data
}

export async function fetchInvite(token: string): Promise<Invite> {
  const { data } = await client.get(`/auth/invites/${token}`)
  return data
}

// 机构管理（Agency）：替换裸 agencyId，支持真实机构档案
export async function fetchAgencies(): Promise<Agency[]> {
  const { data } = await client.get('/auth/agencies')
  return data
}

// D1/D4：建机构时一并建该机构控制台登录账号（phone 必填；id 可选，不传则后端自动生成；initPwd 可选，不传则后端生成并一次性返回）
export async function createAgency(body: {
  id?: string
  name: string
  role: Role
  contact?: string
  phone: string
  initPwd?: string
}): Promise<AgencyView> {
  const { data } = await client.post('/auth/agencies', body)
  return data
}

// D5：硬删机构（前置校验：无进行中路线、无未过期提交链接），仅一手
export async function deleteAgency(id: string): Promise<{ ok: boolean }> {
  const { data } = await client.delete(`/auth/agencies/${id}`)
  return data
}

// 修改旅行社档案 / 切换启用禁用（name / contact / disabled 部分更新），仅一手
export async function updateAgency(
  id: string,
  body: { name?: string; contact?: string; disabled?: boolean },
): Promise<Agency> {
  const { data } = await client.patch(`/auth/agencies/${id}`, body)
  return data
}

