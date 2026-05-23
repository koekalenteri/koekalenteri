import { diff } from 'deep-object-diff'

type DiffObject = Record<string, unknown>
type PartialWithUndefined<T> = {
  [K in keyof T]?: T[K] extends object ? PartialWithUndefined<T[K]> | undefined : T[K] | undefined
}

export type UpdatePatch = {
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
  set: Record<string, unknown>,
  remove: string[]
) => {
  if (value === undefined) {
    remove.push(path)
    return
  }

  // deep-object-diff represents array changes as sparse index objects.
  // Persist the full array from `next` so arrays stay arrays in DynamoDB updates.
  if (Array.isArray(nextValue)) {
    set[path] = nextValue
    return
  }

  if (isDiffObject(value) && isDiffObject(nextValue)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      addPatchOperations(`${path}.${key}`, nestedValue, nextValue[key], set, remove)
    }
    return
  }

  set[path] = nextValue
}

export const createPatch = <T extends object>(next: PartialWithUndefined<T>, oldObject: T): UpdatePatch => {
  const set: Record<string, unknown> = {}
  const remove: string[] = []
  const changes = diff(oldObject, next) as Record<string, unknown>

  for (const [key, value] of Object.entries(changes)) {
    addPatchOperations(key, value, next[key as keyof typeof next], set, remove)
  }

  return {
    changes,
    ...(Object.keys(set).length ? { set } : {}),
    ...(remove.length ? { remove } : {}),
  }
}
