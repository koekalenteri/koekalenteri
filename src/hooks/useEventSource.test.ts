import { renderHook } from '@testing-library/react'

import { useEventSource } from './useEventSource'

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
})
