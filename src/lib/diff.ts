import microdiff, { type Difference } from 'microdiff'

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
    const key = operation.path[0]
    if (key !== undefined) keys.add(String(key))
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

const materializedPath = (operation: Difference, after: object): { path: Difference['path']; value: unknown } => {
  for (let length = 1; length <= operation.path.length; length++) {
    const path = operation.path.slice(0, length)
    const value = valueAtPath(after, path)
    if (Array.isArray(value)) return { path, value }
  }

  return {
    path: operation.path,
    value: operation.type === 'REMOVE' ? undefined : operation.value,
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
    const { path, value } = materializedPath(operation, normalizedAfter)
    setNestedValue(changes, path, value)
  }

  return changes as Partial<T>
}
