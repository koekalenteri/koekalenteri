import type { ConfirmedEvent, DogEvent, KeysOf } from '../types'

export const isConfirmedEvent = (event?: Partial<DogEvent> | null): event is ConfirmedEvent =>
  ['confirmed', 'picked', 'invited', 'started', 'ended', 'completed'].includes(event?.state ?? '')

export const isDefined = <T>(value: T | undefined): value is T => value !== undefined

export const keysOf = <o extends object>(o: o) => Object.keys(o) as KeysOf<o>[]
