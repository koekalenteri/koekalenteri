import type { Patch } from '../../types'
import { getDiffOperations, getNestedChanges, materializeDiffOperation } from '../../lib/diff'

type UpdatePatch = {
  changes: Record<string, unknown>
  remove?: string[]
  set?: Record<string, unknown>
}

export const createPatch = <T extends object>(next: Patch<T>, oldObject: T): UpdatePatch => {
  const set: Record<string, unknown> = {}
  const remove: string[] = []
  const changes = getNestedChanges(oldObject, next)

  for (const operation of getDiffOperations(oldObject, next)) {
    const { path, value } = materializeDiffOperation(operation, next)
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
