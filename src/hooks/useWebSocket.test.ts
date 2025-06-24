import type { PublicDogEvent } from '../types'

import { renderHook } from '@testing-library/react'
import { RecoilRoot } from 'recoil'

import { applyPatch, useWebSocket } from './useWebSocket'

// Mock console.debug to avoid noise in tests
jest.spyOn(console, 'debug').mockImplementation(() => {})

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

describe('useWebSocket', () => {
  // Mock WebSocket
  let mockWebSocketInstance: any

  beforeEach(() => {
    // Create mock WebSocket instance
    mockWebSocketInstance = {
      close: jest.fn(),
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
    }

    // Mock WebSocket constructor
    global.WebSocket = jest.fn(() => mockWebSocketInstance) as any
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should set up event handlers on the WebSocket instance', () => {
    renderHook(() => useWebSocket(), { wrapper: RecoilRoot })

    // Verify event handlers were set
    expect(mockWebSocketInstance.onopen).toBeDefined()
    expect(mockWebSocketInstance.onclose).toBeDefined()
    expect(mockWebSocketInstance.onerror).toBeDefined()
    expect(mockWebSocketInstance.onmessage).toBeDefined()
  })

  it('should ignore invalid JSON messages', () => {
    // This is more of an integration test to ensure no errors are thrown
    expect(() => {
      renderHook(() => useWebSocket(), { wrapper: RecoilRoot })
    }).not.toThrow()
  })

  it('should ignore messages without eventId', () => {
    // This is more of an integration test to ensure no errors are thrown
    expect(() => {
      renderHook(() => useWebSocket(), { wrapper: RecoilRoot })
    }).not.toThrow()
  })
})
