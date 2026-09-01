import type { JsonValue, Patch, PublicContactInfo } from '../types'
import { getNestedChanges, objectsDiffer } from './diff'

export const unique = <T = string>(arr: T[]): T[] => arr.filter((c, i, a) => a.indexOf(c) === i)

export const uniqueFn = <T>(arr: T[], cmp: (a: T, b: T) => boolean): T[] =>
  arr.filter((c, i, a) => a.findIndex((f) => cmp(f, c)) === i)

export const uniqueDate = (arr: Date[]) => [...new Set<number>(arr.map((d) => d.valueOf()))].map((v) => new Date(v))

const DATE_ONLY_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[1-2]\d|3[01])$/
const DATE_RE = /^\d{4}-(?:0[1-9]|1[0-2])-(?:[0-2][1-9]|[1-3]0|3[01])$/
const TIME_RE = /^(?:[0-1]\d|2[0-3])(?::[0-6]\d)(?::[0-6]\d)?(?:\.\d{3})?(?:[+-][0-2]\d:[0-5]\d|Z)?$/

export const isDateOnlyString = (value: unknown): value is string =>
  typeof value === 'string' && DATE_ONLY_RE.test(value)

export const isDateString = (value: unknown): value is string => {
  if (typeof value !== 'string') {
    return false
  }
  const [date, time] = value.split('T')
  return DATE_RE.test(date) && TIME_RE.test(time)
}

export const parseDateOnlyString = (value: string): Date => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day, 12)
}

function dateReviver(_key: string, value: JsonValue): JsonValue | Date {
  if (isDateOnlyString(value)) {
    return parseDateOnlyString(value)
  }
  if (isDateString(value)) {
    const dateObj = new Date(value)
    if (!Number.isNaN(+dateObj)) {
      return dateObj
    }
  }
  return value
}

export const parseJSON = (json: string, reviveDates: boolean = true) => {
  if (!json) return undefined

  const reviver = reviveDates ? dateReviver : undefined

  return JSON.parse(json, reviver)
}

export type AnyObject = Record<string, any>
type EmptyObject = Record<string, never>
type Entries<T> = {
  [K in keyof T]: [K, T[K]]
}[keyof T][]
type PatchWithId<T extends { id: string }> = Patch<T> & { id: string }

export const isEmpty = (o: AnyObject): o is EmptyObject => Object.keys(o).length === 0

export const isObject = (o: unknown): o is AnyObject =>
  o !== null && Object.prototype.toString.call(o) === '[object Object]'

export const isEmptyObject = (o: unknown): o is EmptyObject => isObject(o) && isEmpty(o)

export const getChanges = <T extends object>(a: T | undefined | null, b: T | undefined | null): Partial<T> =>
  getNestedChanges(a, b)

export const hasChanges = (a: object | undefined | null, b: object | undefined | null): boolean => objectsDiffer(a, b)

export const clone = <T extends AnyObject>(a: T): T => ({ ...a })

export const merge = <T extends AnyObject>(a: T, b: Patch<T>): T => {
  const result = isObject(a) ? clone(a) : ({} as T)
  if (!isObject(b)) {
    return result
  }
  for (const [key, value] of Object.entries(b) as Entries<T>) {
    if (value === null) {
      delete result[key]
    } else if (isObject(value)) {
      const old = result[key]
      result[key] = isObject(old) ? merge(old, value) : value
    } else {
      result[key] = value
    }
  }
  return result
}

// This function merges a patch object into a base object, but only creates new objects for paths that actually change
export const patchMerge = <T extends AnyObject, P extends Patch<T>>(base: T, patch: P): T & P => {
  if (!isObject(base) || !isObject(patch)) return patch as T & P

  let changed = false
  // A generic intersection cannot be indexed for writing, so the merge happens on a plain record
  // and the intersection is claimed only on return, where every key of base and patch is merged.
  const result: AnyObject = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      if (key in result) {
        delete result[key]
        changed = true
      }
      continue
    }

    const merged = patchMerge(base[key], value)
    if (merged !== base[key]) {
      result[key] = merged
      changed = true
    }
  }

  return changed ? (result as T & P) : (base as T & P)
}

export const applyPatch = <T extends { id: string }, P extends Patch<T>>(items: T[], itemId: string, patch: P): T[] => {
  let changed = false
  const next = items.map((item) => {
    if (item.id !== itemId) return item
    const merged: T = patchMerge(item, patch)
    if (merged !== item) changed = true
    return merged
  })

  return changed ? next : items
}

export const applyPatchOrInsert = <T extends { id: string }, P extends Patch<T>>(
  items: T[],
  itemId: string,
  patch: P
): T[] => {
  const next = applyPatch(items, itemId, patch)
  if (next !== items || items.some((item) => item.id === itemId)) return next

  // By design an insert trusts the patch to carry every required field of T; the type system
  // cannot know that, so the conversion is deliberate.
  return [...items, { ...patch, id: itemId } as unknown as T]
}

export const applyPatchesById = <T extends { id: string }, P extends Patch<T>>(items: T[], patches: P[]): T[] => {
  if (!patches.length) return items

  const patchesById = new Map<string, P & PatchWithId<T>>(
    patches.filter((item): item is P & PatchWithId<T> => typeof item.id === 'string').map((item) => [item.id, item])
  )
  const existingIds = new Set(items.map((item) => item.id))
  let changed = false

  const next = items.map((item) => {
    const patch = patchesById.get(item.id)
    if (!patch) return item

    const merged = patchMerge(item, patch)
    if (merged !== item) changed = true
    return merged
  })

  for (const [id, patch] of patchesById) {
    if (!existingIds.has(id)) {
      // Same deliberate conversion as in applyPatchOrInsert: an insert trusts the patch to be complete.
      next.push({ ...patch, id } as unknown as T)
      changed = true
    }
  }

  return changed ? next : items
}

export const getPatchChangedIds = <T extends { id: string }, P extends Patch<T>>(
  items: T[],
  patches: P[]
): string[] => {
  if (!patches.length) return []

  const patchesById = new Map<string, P & PatchWithId<T>>(
    patches.filter((item): item is P & PatchWithId<T> => typeof item.id === 'string').map((item) => [item.id, item])
  )

  return items.flatMap((item) => {
    const patch = patchesById.get(item.id)
    if (patch) {
      return patchMerge(item, patch) === item ? [] : [item.id]
    }

    return []
  })
}

export const printContactInfo = (info?: PublicContactInfo) =>
  [info?.name, info?.phone, info?.email].filter(Boolean).join(', ')

/** Splits `total` evenly across `count` shares, giving the remainder to the first share. */
export const splitEvenly = (total: number, count: number): number[] => {
  if (count <= 0) return []

  const share = Math.floor(total / count)
  const remainder = total % count
  return Array.from({ length: count }, (_, index) => share + (index === 0 ? remainder : 0))
}
