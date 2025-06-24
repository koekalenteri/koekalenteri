import type { PublicDogEvent } from '../types'

import { applyPatch } from './useWebSocket'

describe('applyPatch', () => {
  const baseEvents = [
    { id: '1', name: 'Event 1' },
    { id: '2', name: 'Event 2' },
  ] as PublicDogEvent[]

  it('returns original array if eventId not found', () => {
    const result = applyPatch(baseEvents, '3', { name: 'Updated' })
    expect(result).toBe(baseEvents)
  })

  it('returns new array with patched event if event changes', () => {
    const patch = { name: 'Updated Event 1' }
    const result = applyPatch(baseEvents, '1', patch)
    expect(result).not.toBe(baseEvents)
    expect(result.find((e) => e.id === '1')?.name).toBe('Updated Event 1')
  })

  it('returns original array if event did not change', () => {
    const patch = { name: 'Event 1' }
    const result = applyPatch(baseEvents, '1', patch)
    expect(result).toBe(baseEvents)
  })
})
