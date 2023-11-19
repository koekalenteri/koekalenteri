import type { ConfirmedEvent, DogEvent } from '../types'

export const isConfirmedEvent = (event?: Partial<DogEvent> | null): event is ConfirmedEvent =>
  ['confirmed', 'picked', 'invited', 'started', 'ended', 'completed'].includes(event?.state ?? '')
