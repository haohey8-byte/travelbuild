import client from './client'
import type { LoginResult, User, Role } from '@/types'

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

export async function fetchInvite(token: string) {
  const { data } = await client.get(`/auth/invites/${token}`)
  return data
}
