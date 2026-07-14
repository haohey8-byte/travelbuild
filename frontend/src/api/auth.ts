import client from './client'
import type { LoginResult, User, Role, Invite, PermissionMatrix } from '@/types'

// 认证 —— 对应 doc/04-接口契约/账号与认证.md
export async function devLogin(role: Role): Promise<LoginResult> {
  const { data } = await client.post('/auth/dev-login', { role })
  return data
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
export async function disableMember(id: string): Promise<User> {
  const { data } = await client.post(`/auth/members/${id}/disable`)
  return data
}
