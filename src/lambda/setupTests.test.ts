import { vi } from 'vitest'

// Faked before the date code loads, the way several lambda tests do it. If @date-fns/tz were first
// loaded now, TZDate would extend the fake Date and answer in the host zone (UTC in CI).
vi.useFakeTimers()

const { dayOf, TIME_ZONE } = await import('../lib/day')

describe('setupTests', () => {
  // Two zones whose days differ at this moment, so the host zone cannot pass for both.
  it('keeps the zoned day when a test fakes the clock before loading the date code', () => {
    const moment = new Date('2026-09-11T21:00:00.000Z')
    expect(dayOf(moment, TIME_ZONE)).toBe('2026-09-12')
    expect(dayOf(moment, 'America/New_York')).toBe('2026-09-11')
  })
})
