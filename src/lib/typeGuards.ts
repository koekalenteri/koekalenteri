import type { ConfirmedEvent, Event } from '../types'

export const isConfirmedEvent = (event?: Partial<Event> | null): event is ConfirmedEvent =>
  ['confirmed', 'picked', 'invited', 'started', 'ended', 'completed'].includes(event?.state ?? '')
