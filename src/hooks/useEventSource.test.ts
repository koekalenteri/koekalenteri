import type { PublicDogEvent } from '../types'

import { renderHook } from '@testing-library/react'

import { useEventSource } from './useEventSource'
import { applyPatch } from './useEventSource'

// Mock dependencies
jest.mock('recoil')
jest.mock('../pages/recoil')

const closeMock = jest.fn()
const mockConstructor = jest.fn()

class FakeEventSource {
  static lastInstance: FakeEventSource

  onopen: ((e: MessageEvent) => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  constructor(url: string) {
    mockConstructor(url)
    FakeEventSource.lastInstance = this
  }
  close = closeMock
}

describe('useEventSource', () => {
  const originalEventSource = global.EventSource

  beforeAll(() => {
    global.EventSource = FakeEventSource as any
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    global.EventSource = originalEventSource
  })

  it('should create an EventSource with the correct URL and closes on cleanup', () => {
    const { unmount } = renderHook(() => useEventSource())

    expect(mockConstructor).toHaveBeenCalledWith(
      `https://sse-worker.koekalenteri.workers.dev?channel=koekalenteri-test`
    )
    expect(mockConstructor).toHaveBeenCalledTimes(1)

    unmount()

    expect(closeMock).toHaveBeenCalledTimes(1)
  })

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
})
