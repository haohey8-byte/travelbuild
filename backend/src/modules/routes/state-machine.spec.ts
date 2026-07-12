import { describe, expect, it } from 'vitest'
import {
  ACTION,
  applyTransition,
  InvalidTransitionError,
  nextStatus,
  STATUS,
  validateStateMachine,
} from './state-machine'

describe('路线状态机', () => {
  it('启动自检通过', () => {
    expect(() => validateStateMachine()).not.toThrow()
  })

  it('旅行社提交草案：咨询中 → 待一手确认', () => {
    expect(nextStatus(STATUS.CONSULTING, ACTION.SUBMIT_DRAFT)).toBe(
      STATUS.AWAITING_PK_CONFIRM,
    )
  })

  it('修订重交：待旅行社修订 → 待一手确认', () => {
    expect(
      nextStatus(STATUS.AWAITING_AGENCY_REVISION, ACTION.SUBMIT_DRAFT),
    ).toBe(STATUS.AWAITING_PK_CONFIRM)
  })

  it('一手确认采用：待一手确认 → 待报价', () => {
    expect(
      nextStatus(STATUS.AWAITING_PK_CONFIRM, ACTION.PK_CONFIRM),
    ).toBe(STATUS.AWAITING_QUOTE)
  })

  it('一手回传反馈：待一手确认 → 待旅行社修订', () => {
    expect(
      nextStatus(STATUS.AWAITING_PK_CONFIRM, ACTION.PK_FEEDBACK),
    ).toBe(STATUS.AWAITING_AGENCY_REVISION)
  })

  it('报价主链路：待报价→待反馈→待确认→已确认→已成单', () => {
    expect(nextStatus(STATUS.AWAITING_QUOTE, ACTION.SEND_V1)).toBe(
      STATUS.AWAITING_FEEDBACK,
    )
    expect(
      nextStatus(STATUS.AWAITING_FEEDBACK, ACTION.AGENCY_MARKUP),
    ).toBe(STATUS.AWAITING_CONFIRM)
    expect(
      nextStatus(STATUS.AWAITING_CONFIRM, ACTION.TOURIST_CONFIRM),
    ).toBe(STATUS.CONFIRMED)
    expect(nextStatus(STATUS.CONFIRMED, ACTION.PAY)).toBe(STATUS.BOOKED)
  })

  it('拒绝：待反馈/待确认 → 已流失', () => {
    expect(nextStatus(STATUS.AWAITING_FEEDBACK, ACTION.REJECT)).toBe(STATUS.LOST)
    expect(nextStatus(STATUS.AWAITING_CONFIRM, ACTION.REJECT)).toBe(STATUS.LOST)
  })

  it('非法转移返回 null 且抛错', () => {
    expect(nextStatus(STATUS.CONSULTING, ACTION.PK_CONFIRM)).toBeNull()
    expect(() =>
      applyTransition(STATUS.CONSULTING, ACTION.PK_CONFIRM),
    ).toThrow(InvalidTransitionError)
  })

  it('待一手确认不能直接发报价 v1（需先确认/反馈）', () => {
    expect(
      nextStatus(STATUS.AWAITING_PK_CONFIRM, ACTION.SEND_V1),
    ).toBeNull()
  })
})
