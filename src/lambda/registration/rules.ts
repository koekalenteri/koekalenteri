import type { JsonRegistration } from '../../types'
import type { RegistrationPatch } from './repository'

/**
 * Builds a patch that describes only the fields that differ between `existing`
 * and `next`.  Returns `undefined` when there are no effective changes.
 *
 * Pure function — no side effects, no I/O.
 */
export const buildRegistrationPatch = (
  existing: JsonRegistration,
  next: Partial<JsonRegistration>
): RegistrationPatch | undefined => {
  const set: Partial<JsonRegistration> = {}
  const remove: Array<keyof JsonRegistration> = []

  for (const _key of Object.keys(next) as Array<keyof JsonRegistration>) {
    const key = _key
    if (next[key] === undefined) {
      if (existing[key] !== undefined) {
        remove.push(key)
      }
    } else if (JSON.stringify(next[key]) !== JSON.stringify(existing[key])) {
      // biome-ignore lint/suspicious/noExplicitAny: generic patch builder
      ;(set as any)[key] = next[key]
    }
  }

  if (Object.keys(set).length === 0 && remove.length === 0) return undefined
  return { ...(Object.keys(set).length > 0 ? { set } : {}), ...(remove.length > 0 ? { remove } : {}) }
}
