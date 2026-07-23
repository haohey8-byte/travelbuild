import { randomBytes } from 'crypto'

/**
 * 生成不可预测的共享/提交令牌（替代 Math.random 拼接，防可预测）。
 * 用于 RouteShare / RouteIntake / Invite 等各类令牌。
 */
export function genToken(): string {
  return randomBytes(16).toString('hex')
}
