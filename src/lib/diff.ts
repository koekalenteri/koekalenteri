import type { Difference } from 'microdiff'
import microdiff from 'microdiff'

type DiffInput = object | null | undefined
type NestedPatch = Record<string, unknown>

const normalizeInput = (value: DiffInput): object => value ?? {}

export const getDiffOperations = (before: DiffInput, after: DiffInput): Difference[] =>
  microdiff(normalizeInput(before), normalizeInput(after), { cyclesFix: false })

export const objectsDiffer = (before: DiffInput, after: DiffInput): boolean =>
  getDiffOperations(before, after).length > 0

export const getChangedTopLevelKeys = (before: DiffInput, after: DiffInput): string[] => {
  const keys = new Set<string>()
  for (const operation of getDiffOperations(before, after)) {
    keys.add(String(operation.path[0]))
  }
  return [...keys]
}

const valueAtPath = (value: object, path: Difference['path']): unknown => {
  let current: unknown = value
  for (const segment of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string | number, unknown>)[segment]
  }
  return current
}

export const materializeDiffOperation = (
  operation: Difference,
  after: object
): { path: Difference['path']; value: unknown } => {
  for (let length = 1; length <= operation.path.length; length++) {
    const path = operation.path.slice(0, length)
    const value = valueAtPath(after, path)
    if (Array.isArray(value)) return { path, value }

    // DynamoDB update paths cannot distinguish a numeric map key (for example a
    // breed code such as cost.breed["110"]) from an array index. Replace the
    // containing map instead of emitting the invalid path cost.breed[110].
    const nextSegment = operation.path[length]
    if (
      nextSegment !== undefined &&
      String(Number(nextSegment)) === String(nextSegment) &&
      value !== null &&
      typeof value === 'object'
    ) {
      return { path, value }
    }
  }

  return {
    path: operation.path,
    // `null` (not `undefined`) so the removal survives JSON.stringify when this patch is sent
    // over the wire — patchMerge/createPatch both already treat `null` as "delete this key".
    value: operation.type === 'REMOVE' ? null : operation.value,
  }
}

const setNestedValue = (target: NestedPatch, path: Difference['path'], value: unknown) => {
  let current = target
  for (let index = 0; index < path.length - 1; index++) {
    const segment = String(path[index])
    const existing = current[segment]
    if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
      current[segment] = {}
    }
    current = current[segment] as NestedPatch
  }
  current[String(path.at(-1))] = value
}

export const getNestedChanges = <T extends object>(
  before: object | null | undefined,
  after: T | null | undefined
): Partial<T> => {
  const normalizedAfter = normalizeInput(after)
  const changes: NestedPatch = {}

  for (const operation of getDiffOperations(before, after)) {
    const { path, value } = materializeDiffOperation(operation, normalizedAfter)
    setNestedValue(changes, path, value)
  }

  return changes as Partial<T>
}
