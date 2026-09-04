import type { ClassStartNumbers } from '../../types'
import type { StartNumberEntry, StartNumberPatch } from '../startNumbers'
import { vi } from 'vitest'

export const getClassStartNumbers = vi.fn(
  async (_eventId: string, _eventClass: string, _token: string, _signal?: AbortSignal): Promise<ClassStartNumbers> => {
    throw new Error('not mocked')
  }
)

/** Every entry reads as written: the number the sheet sent is the number it gets back. */
export const putClassStartNumbers = vi.fn(
  async (
    _eventId: string,
    _eventClass: string,
    numbers: StartNumberEntry[],
    _token: string,
    _signal?: AbortSignal
  ): Promise<{ patches: StartNumberPatch[] }> => ({
    patches: numbers.map(({ id, startNumber }) => ({ id, startGroup: { key: 'participants', number: startNumber } })),
  })
)

export const getStartNumberLink = vi.fn(
  async (_eventId: string, eventClass: string, _token: string, _signal?: AbortSignal) => ({
    token: `token-${eventClass}`,
  })
)
