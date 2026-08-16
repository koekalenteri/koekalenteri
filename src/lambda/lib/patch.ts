import type { Patch } from '../../types'
import { getDiffOperations, getNestedChanges } from '../../lib/diff'

type DiffOperation = ReturnType<typeof getDiffOperations>[number]

type UpdatePatch = {
  changes: Record<string, unknown>
  remove?: string[]
  set?: Record<string, unknown>
}

const valueAtPath = (value: object, path: DiffOperation['path']): unknown => {
  let current: unknown = value
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = Reflect.get(current, segment)
  }
  return current
}

const materializeArrayOperation = (
  operation: DiffOperation,
  next: object
): { path: DiffOperation['path']; value: unknown } | undefined => {
  for (let length = 1; length <= operation.path.length; length++) {
    const path = operation.path.slice(0, length)
    const value = valueAtPath(next, path)
    if (Array.isArray(value)) return { path, value }
  }
  return undefined
}

export const createPatch = <T extends object>(next: Patch<T>, oldObject: T): UpdatePatch => {
  const set: Record<string, unknown> = {}
  const remove: string[] = []
  const changes = getNestedChanges(oldObject, next)

  for (const operation of getDiffOperations(oldObject, next)) {
    const arrayOperation = materializeArrayOperation(operation, next)
    const path = arrayOperation?.path ?? operation.path
    const value = arrayOperation?.value ?? (operation.type === 'REMOVE' ? undefined : operation.value)
    const dottedPath = path.join('.')

    if (value === undefined || value === null) {
      if (!remove.includes(dottedPath)) remove.push(dottedPath)
    } else {
      set[dottedPath] = value
    }
  }

  return {
    changes,
    ...(Object.keys(set).length ? { set } : {}),
    ...(remove.length ? { remove } : {}),
  }
}
