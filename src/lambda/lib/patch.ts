import type { Patch } from '../../types'
import { diff } from 'deep-object-diff'

type DiffObject = Record<string, unknown>

type UpdatePatch = {
  changes: Record<string, unknown>
  remove?: string[]
  set?: Record<string, unknown>
}

const isDiffObject = (value: unknown): value is DiffObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const addPatchOperations = (
  path: string,
  value: unknown,
  nextValue: unknown,
  oldValue: unknown,
  set: Record<string, unknown>,
  remove: string[]
) => {
  if (value === undefined || value === null) {
    remove.push(path)
    return
  }

  // deep-object-diff represents array changes as sparse index objects.
  // Persist the full array from `next` so arrays stay arrays in DynamoDB updates.
  if (Array.isArray(nextValue)) {
    set[path] = nextValue
    return
  }

  // Only descend into nested dot-paths when the parent map already exists on the
  // stored item. DynamoDB rejects "SET #a.#b = ..." with "The document path provided
  // in the update expression is invalid for update" when `#a` doesn't yet exist.
  // In that case we must persist the whole subtree at the current path instead.
  if (isDiffObject(value) && isDiffObject(nextValue) && isDiffObject(oldValue)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      addPatchOperations(`${path}.${key}`, nestedValue, nextValue[key], oldValue[key], set, remove)
    }
    return
  }

  set[path] = nextValue
}

const normalizeChanges = (value: unknown, nextValue: unknown): unknown => {
  if (Array.isArray(nextValue)) {
    return nextValue
  }

  if (isDiffObject(value) && isDiffObject(nextValue)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, normalizeChanges(nestedValue, nextValue[key])])
    )
  }

  return value
}

export const createPatch = <T extends object>(next: Patch<T>, oldObject: T): UpdatePatch => {
  const set: Record<string, unknown> = {}
  const remove: string[] = []
  const rawChanges = diff(oldObject, next) as Record<string, unknown>
  const changes = Object.fromEntries(
    Object.entries(rawChanges).map(([key, value]) => [key, normalizeChanges(value, next[key as keyof typeof next])])
  )

  for (const [key, value] of Object.entries(rawChanges)) {
    addPatchOperations(
      key,
      value,
      next[key as keyof typeof next],
      (oldObject as Record<string, unknown>)[key],
      set,
      remove
    )
  }

  return {
    changes,
    ...(Object.keys(set).length ? { set } : {}),
    ...(remove.length ? { remove } : {}),
  }
}
