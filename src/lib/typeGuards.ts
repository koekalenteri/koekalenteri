import type { ConfirmedEvent, DogEvent } from '../types'

export const isConfirmedEvent = (event?: Partial<DogEvent> | null): event is ConfirmedEvent =>
  ['confirmed', 'picked', 'invited', 'started', 'ended', 'completed'].includes(event?.state ?? '')

export const isDefined = <T>(value: T | undefined): value is T => value !== undefined
