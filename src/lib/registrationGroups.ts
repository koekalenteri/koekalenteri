import type { JsonRegistration, Registration, RegistrationGroupMove } from '../types'
import {
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  getGroupKey,
  getRegistrationGroupDay,
  getRegistrationGroupKey,
  getRegistrationNumberingGroupKey,
} from './registration'

type GroupedRegistration = Pick<
  JsonRegistration | Registration,
  'cancelled' | 'cancelReason' | 'class' | 'eventType' | 'group' | 'id' | 'startGroup'
>

type RegistrationGroupMoveResult<T extends GroupedRegistration> = {
  invalid: RegistrationGroupMove[]
  items: T[]
}

const copyGroup = (group: GroupedRegistration['group']) => (group ? { ...group } : undefined)

// The day is the trial's calendar day, as the group key names it: two instants of one Helsinki day
// are one group, however the stored date is spelled (KOE-1541).
const sortSnapshot = (a: GroupedRegistration, b: GroupedRegistration) =>
  getRegistrationGroupDay(a.group?.date).localeCompare(getRegistrationGroupDay(b.group?.date)) ||
  // Keep the established ordering semantics from
  // sortRegistrationsByDateClassTimeAndNumber. eventType participates in the
  // numbering-group key, but must not change the sort order within a snapshot.
  (a.class ?? '').localeCompare(b.class ?? '') ||
  (a.group?.time ?? '').localeCompare(b.group?.time ?? '') ||
  (a.group?.number ?? Number.MAX_SAFE_INTEGER) - (b.group?.number ?? Number.MAX_SAFE_INTEGER)

const isInvalidMoveAnchor = <T extends GroupedRegistration>(
  move: RegistrationGroupMove,
  item: T,
  before: T | undefined,
  targetNumberingGroupKey: string,
  targetGroupKey: string
) =>
  !!move.beforeId &&
  (!before ||
    before.id === item.id ||
    getRegistrationNumberingGroupKey(before) !== targetNumberingGroupKey ||
    // The key names the day and the time of a participant group, so it is the whole comparison.
    getRegistrationGroupKey(before) !== targetGroupKey ||
    before.group?.time !== move.group.time)

/** Sorts and renumbers a complete registration snapshot in place. */
export const normalizeRegistrationGroups = <T extends GroupedRegistration>(items: T[]): T[] => {
  items.sort(sortSnapshot)
  const numberingGroups: Record<string, T[]> = {}
  for (const item of items) {
    const key = getRegistrationNumberingGroupKey(item)
    const registrations = numberingGroups[key] ?? []
    registrations.push(item)
    numberingGroups[key] = registrations
  }
  for (const registrations of Object.values(numberingGroups)) {
    registrations.forEach((registration, index) => {
      registration.group = {
        ...registration.group,
        key: getRegistrationGroupKey(registration),
        number: index + 1,
      } as T['group']
    })
  }

  return items
}

const applyRegistrationGroupMove = <T extends GroupedRegistration>(
  items: T[],
  move: RegistrationGroupMove,
  insertionsBeforeAnchor: Map<string, number>
): boolean => {
  const item = items.find((registration) => registration.id === move.id)
  if (!item) return false

  // A payload from a cached client may still name the UTC day; the group is the day it is on.
  const group = { ...move.group, key: getGroupKey(move.group) }
  const before = move.beforeId ? items.find((registration) => registration.id === move.beforeId) : undefined
  const targetNumberingGroupKey = getRegistrationNumberingGroupKey({
    ...item,
    cancelled: group.key === GROUP_KEY_CANCELLED,
    group,
  })
  if (isInvalidMoveAnchor(move, item, before, targetNumberingGroupKey, group.key)) return false

  const siblings = items.filter(
    (registration) => registration.id !== item.id && getRegistrationGroupKey(registration) === group.key
  )
  const lastNumber = siblings.reduce((last, registration) => Math.max(last, registration.group?.number ?? 0), 0)
  const beforeNumber = before?.group?.number
  const insertionCount = before && beforeNumber !== undefined ? (insertionsBeforeAnchor.get(before.id) ?? 0) + 1 : 0
  if (insertionCount && before) insertionsBeforeAnchor.set(before.id, insertionCount)
  item.group = {
    ...group,
    number: beforeNumber === undefined ? lastNumber + 1 : beforeNumber - 1 / (insertionCount + 1),
  } as T['group']
  item.cancelled = group.key === GROUP_KEY_CANCELLED
  if (item.cancelled) item.cancelReason = move.cancelReason
  else delete item.cancelReason
  // A dog moved back to the reserve list gives its drawn number up here and now (KOE-1428). A
  // cancelled dog keeps its number for the POISSA row on the public list, but a reserve dog has no
  // row there, and its `group.number` is a place in the queue, a numbering of its own: a drawn
  // number left on it showed on the reserve list as if the dog still held it, and sorted the queue
  // by it. Decided here so the admin UI's projection and the Lambda's write drop it alike.
  if (group.key === GROUP_KEY_RESERVE) delete item.startGroup
  return true
}

/**
 * Applies placement commands and normalizes the affected snapshot. This is
 * deliberately pure so the admin UI and Lambda persist exactly the same
 * ordering decision.
 */
export const applyRegistrationGroupMoves = <T extends GroupedRegistration>(
  source: readonly T[],
  moves: readonly RegistrationGroupMove[]
): RegistrationGroupMoveResult<T> => {
  if (moves.length === 0) return { invalid: [], items: [...source] }

  const items = source.map((item) => ({ ...item, group: copyGroup(item.group) })) as T[]
  const invalid: RegistrationGroupMove[] = []
  const insertionsBeforeAnchor = new Map<string, number>()

  for (const move of moves) {
    if (!applyRegistrationGroupMove(items, move, insertionsBeforeAnchor)) {
      invalid.push(move)
    }
  }

  normalizeRegistrationGroups(items)

  return {
    invalid,
    items,
  }
}
