import type { DeepPartial, JsonEventResult, JsonRegistration } from '../../types'
import { vi } from 'vitest'
import { asJsonRegistration } from './helpers'

/** The error DynamoDB answers a write whose condition no longer holds. */
export const conditionalCheckFailure = () =>
  Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' })

/**
 * The registration table as the results endpoints use it, held in memory: the rows a test stores, read
 * by `readEventRegistrations` and `readRegistration`, and a `writeEventResult` that writes a dog's result
 * on the condition the real one has (KOE-1490): the result's `updatedAt` is still the one read, or still
 * absent when none was read. `written` is called with each write that landed, as
 * `(eventId, id, eventResult)`. A test that keeps rows of its own by id passes their map.
 */
export const registrationStore = (rows = new Map<string, JsonRegistration>()) => {
  const written = vi.fn()

  return {
    readEventRegistrations: async (_eventId: string, _consistent?: boolean) =>
      [...rows.values()].map((row) => structuredClone(row)),
    readRegistration: async (_eventId: string, id: string, _consistent?: boolean) => {
      const row = rows.get(id)
      return row && structuredClone(row)
    },
    /** The dog's result as stored now, its tasks read as none where it has none. Throws when there is none. */
    resultOf: (id: string) => {
      const result = rows.get(id)?.eventResult
      if (!result) throw new Error(`no result stored for ${id}`)
      return { ...result, tasks: result.tasks ?? [] }
    },
    /** Replaces every stored row with these: fixtures, which may hold only what a test reads. */
    store: (registrations: readonly DeepPartial<JsonRegistration>[]) => {
      rows.clear()
      for (const registration of registrations) {
        const row = asJsonRegistration(structuredClone(registration))
        rows.set(row.id, row)
      }
    },
    writeEventResult: async (eventId: string, id: string, eventResult: JsonEventResult, readUpdatedAt?: string) => {
      const row = rows.get(id)
      if (!row || row.eventResult?.updatedAt !== readUpdatedAt) throw conditionalCheckFailure()
      rows.set(id, { ...row, eventResult: structuredClone(eventResult) })
      written(eventId, id, eventResult)
    },
    written,
  }
}
