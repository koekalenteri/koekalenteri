import { Organizer } from './Organizer';
import { startOfDay, endOfDay, subDays } from 'date-fns';

export type Event = {
  id: string
  organizer: Organizer
  eventType: string
  classes: Array<string | EventClass>
  startDate: Date
  endDate: Date
  entryStartDate: Date
  entryEndDate: Date
  location: string
  name: string
  description: string
  places: number
  entries: number
  allowOnlineEntry: boolean
  allowOnlinePayment: boolean
  unofficial: boolean
  allowOwnerMembershipPriority: boolean
  allowHandlerMembershipPriority: boolean
  cost: number
  costMember: number
  paymentDetails: string
  accountNumber: string
  referenceNumber: string
  requirePaymentBeforeEntry: boolean
  judges: Array<number>
  official: number
  createdAt: Date
  createdBy: string
  modifiedAt: Date
  modifiedBy: string
}

export type EventClass = {
  date: Date
  class: string
  judge: {
    id: number,
    name: string
  },
  places: number
  entries: number
  members: number
}

export interface EventEx extends Event {
  isEntryOpen: boolean
  isEntryClosing: boolean
}

export function extendEvent(event: Event, now = new Date()): EventEx {
  const isEntryOpen = startOfDay(new Date(event.entryStartDate)) <= now && endOfDay(new Date(event.entryEndDate)) >= now;
  return {
    ...event,
    isEntryOpen,
    isEntryClosing: isEntryOpen && subDays(new Date(event.entryEndDate), 7) <= now
  };
}

export const extendEvents = (events: Event[], now = new Date()): EventEx[] => events.map((event) => extendEvent(event, now))
