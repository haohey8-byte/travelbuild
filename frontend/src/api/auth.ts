import client from './client'
import type {
  LoginResult,
  User,
  Role,
  Invite,
  PermissionMatrix,
  Agency,
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

// 创建邀请（两层级：一手邀请机构管理员 → 管理员/一手邀请机构员工）
export async function createInvite(body: {
  role: Role
  agencyId?: string
  level?: 'admin' | 'staff'
  email?: string
}): Promise<Invite> {
  const { data } = await client.post('/auth/invites', body)
  return data
}

// 邀请列表（按权限隔离）
export async function listInvites(): Promise<Invite[]> {
  const { data } = await client.get('/auth/invites')
  return data
}

// 成员列表（需登录）
export async function fetchMembers(): Promise<User[]> {
  const { data } = await client.get('/auth/members')
  return data
}

// 权限矩阵（字段级 + 物理隔绝）
export async function fetchPermissionMatrix(): Promise<PermissionMatrix> {
  const { data } = await client.get('/auth/permissions/matrix')
  return data
}

// 改成员角色（仅一手）
export async function updateMemberRole(id: string, role: Role): Promise<User> {
  const { data } = await client.put(`/auth/members/${id}/role`, { role })
  return data
}

// 停用成员（仅一手）
// 机构管理（Agency）：替换裸 agencyId，支持真实机构档案
export async function fetchAgencies(): Promise<Agency[]> {
  const { data } = await client.get('/auth/agencies')
  return data
}

export async function createAgency(body: {
  id: string
  name: string
  role: Role
  contact?: string
}): Promise<Agency> {
  const { data } = await client.post('/auth/agencies', body)
  return data
}

