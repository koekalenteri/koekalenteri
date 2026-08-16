import type { PatchOperation, PatchPath } from '../types'
import { getDiffOperations } from './diff'

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export class InvalidPatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidPatchError'
  }
}

const pathKey = (path: PatchPath): string => JSON.stringify(path)

const validatePath = (path: PatchPath) => {
  if (!path.length) throw new InvalidPatchError('Patch path must not be empty')

  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Number.isSafeInteger(segment) || segment < 0) {
        throw new InvalidPatchError(`Invalid array index in patch path ${pathKey(path)}`)
      }
    } else if (!segment || FORBIDDEN_KEYS.has(segment)) {
      throw new InvalidPatchError(`Invalid object key in patch path ${pathKey(path)}`)
    }
  }
}

const isPathPrefix = (prefix: PatchPath, path: PatchPath): boolean =>
  prefix.length <= path.length && prefix.every((segment, index) => segment === path[index])

const validateOperations = (operations: readonly PatchOperation[]) => {
  for (let index = 0; index < operations.length; index++) {
    const operation = operations[index]
    validatePath(operation.path)

    for (let otherIndex = 0; otherIndex < index; otherIndex++) {
      const otherPath = operations[otherIndex].path
      if (isPathPrefix(operation.path, otherPath) || isPathPrefix(otherPath, operation.path)) {
        throw new InvalidPatchError(
          `Patch operations must not contain duplicate or overlapping paths: ${pathKey(operation.path)}`
        )
      }
    }
  }
}

const comparePaths = (left: PatchPath, right: PatchPath): number => {
  const length = Math.min(left.length, right.length)
  for (let index = 0; index < length; index++) {
    const leftSegment = left[index]
    const rightSegment = right[index]
    if (leftSegment === rightSegment) continue
    if (typeof leftSegment === 'number' && typeof rightSegment === 'number') return leftSegment - rightSegment
    return String(leftSegment).localeCompare(String(rightSegment))
  }
  return left.length - right.length
}

const operationPriority = (operation: PatchOperation): number => {
  if (operation.type === 'CHANGE') return 0
  if (operation.type === 'REMOVE') return 1
  return 2
}

const compareOperations = (left: PatchOperation, right: PatchOperation): number => {
  const priority = operationPriority(left) - operationPriority(right)
  if (priority) return priority

  const leftLast = left.path.at(-1)
  const rightLast = right.path.at(-1)
  const leftParent = left.path.slice(0, -1)
  const rightParent = right.path.slice(0, -1)
  if (
    left.type === 'REMOVE' &&
    typeof leftLast === 'number' &&
    typeof rightLast === 'number' &&
    comparePaths(leftParent, rightParent) === 0
  ) {
    return rightLast - leftLast
  }

  return comparePaths(left.path, right.path)
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && Object.prototype.toString.call(value) === '[object Object]'

const assertPatchChild = (child: unknown, operation: PatchOperation) => {
  if (!Array.isArray(child) && !isRecord(child)) {
    throw new InvalidPatchError(`Patch parent is not an object or array: ${pathKey(operation.path)}`)
  }
  return child
}

const applyArrayOperation = (current: unknown[], operation: PatchOperation, depth: number): unknown[] => {
  const key = operation.path[depth]
  if (typeof key !== 'number') {
    throw new InvalidPatchError(`Array patch path must use an index: ${pathKey(operation.path)}`)
  }
  const result = [...current]
  const last = depth === operation.path.length - 1
  if (!last) {
    if (key >= result.length) throw new InvalidPatchError(`Patch path does not exist: ${pathKey(operation.path)}`)
    result[key] = applyOperationAtPath(assertPatchChild(result[key], operation), operation, depth + 1)
    return result
  }
  if (operation.type === 'CREATE') {
    if (key > result.length) {
      throw new InvalidPatchError(`Array create index is out of bounds: ${pathKey(operation.path)}`)
    }
    result.splice(key, 0, operation.value)
    return result
  }
  if (key >= result.length) {
    throw new InvalidPatchError(`Array patch index is out of bounds: ${pathKey(operation.path)}`)
  }
  if (operation.type === 'REMOVE') result.splice(key, 1)
  else result[key] = operation.value
  return result
}

const applyRecordOperation = (
  current: Record<string, unknown>,
  operation: PatchOperation,
  depth: number
): Record<string, unknown> => {
  const key = operation.path[depth]
  if (typeof key !== 'string') {
    throw new InvalidPatchError(`Object patch path must use a key: ${pathKey(operation.path)}`)
  }
  const exists = Object.hasOwn(current, key)
  const result = { ...current }
  const last = depth === operation.path.length - 1
  if (!last) {
    if (!exists) throw new InvalidPatchError(`Patch path does not exist: ${pathKey(operation.path)}`)
    result[key] = applyOperationAtPath(assertPatchChild(result[key], operation), operation, depth + 1)
    return result
  }
  if (operation.type === 'CREATE') {
    if (exists) throw new InvalidPatchError(`Patch create target already exists: ${pathKey(operation.path)}`)
    result[key] = operation.value
  } else if (!exists) {
    throw new InvalidPatchError(`Patch target does not exist: ${pathKey(operation.path)}`)
  } else if (operation.type === 'REMOVE') {
    delete result[key]
  } else {
    result[key] = operation.value
  }
  return result
}

function applyOperationAtPath(
  current: Record<string, unknown> | unknown[],
  operation: PatchOperation,
  depth = 0
): Record<string, unknown> | unknown[] {
  return Array.isArray(current)
    ? applyArrayOperation(current, operation, depth)
    : applyRecordOperation(current, operation, depth)
}

export const createPatchOperations = (before: object, after: object): PatchOperation[] =>
  getDiffOperations(before, after).flatMap<PatchOperation>((difference) => {
    if (difference.type === 'REMOVE') return [{ path: difference.path, type: 'REMOVE' }]
    if (difference.value === undefined) {
      return difference.type === 'CHANGE' ? [{ path: difference.path, type: 'REMOVE' }] : []
    }
    return [{ path: difference.path, type: difference.type, value: difference.value }]
  })

export const applyPatchOperations = <T extends object>(base: T, operations: readonly PatchOperation[]): T => {
  if (!operations.length) return base

  validateOperations(operations)
  let result: object = base
  for (const operation of [...operations].sort(compareOperations)) {
    if (!isRecord(result) && !Array.isArray(result)) {
      throw new InvalidPatchError('Patch root must be an object or array')
    }
    result = applyOperationAtPath(result, operation)
  }
  return result as T
}

const isPatchOperation = (value: unknown): value is PatchOperation => {
  if (typeof value !== 'object' || value === null) return false
  const operation = value as Record<string, unknown>
  if (!Array.isArray(operation.path)) return false
  if (operation.type === 'REMOVE') return !Object.hasOwn(operation, 'value')
  return (operation.type === 'CREATE' || operation.type === 'CHANGE') && Object.hasOwn(operation, 'value')
}

export const isPatchOperationRequest = (value: unknown): value is { operations: PatchOperation[] } =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as Record<string, unknown>).operations) &&
  (value as Record<string, unknown[]>).operations.every(isPatchOperation)
