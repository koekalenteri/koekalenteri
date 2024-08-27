import type { AtLeastOne, ConfirmedEvent, DogEvent, KeysOf } from '../types'

export const isConfirmedEvent = (event?: Partial<DogEvent> | null): event is ConfirmedEvent =>
  ['confirmed', 'picked', 'invited', 'started', 'ended', 'completed'].includes(event?.state ?? '')

export const isDefined = <T>(value: T | undefined): value is T => value !== undefined

export const keysOf = <o extends object>(o: o) => Object.keys(o) as KeysOf<o>[]

export const exhaustiveStringTuple =
  <T extends string>() =>
  <L extends AtLeastOne<T>>(
    ...x: L extends any ? (Exclude<T, L[number]> extends never ? L : Exclude<T, L[number]>[]) : never
  ) =>
    x
