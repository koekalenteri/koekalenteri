import { ConfirmedEvent, Event } from 'koekalenteri-shared/model'

export const isConfirmedEvent = (event?: Partial<Event> | null): event is ConfirmedEvent => event?.state === 'confirmed'
