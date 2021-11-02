import { Organizer } from './Organizer';
import { startOfDay, endOfDay } from 'date-fns';

export type Event = {
  id: string
  organizer: Organizer
  eventType: string
  classes: Array<string>
  startDate: Date
  endDate: Date
  entryStartDate: Date
  entryEndDate: Date
  location: string
  name: string
  description: string
  places: number // TODO places / class
  entries: number // TODO entries / class
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
  judges: Array<number> //TODO judges / class
  official: number
  createdAt: string
  createdBy: string
  modifiedAt: string
  modifiedBy: string
}

export interface EventEx extends Event {
  isEntryOpen: boolean;
}

export const extendEvent = (event: Event, now = new Date()): EventEx => ({
  ...event,
  isEntryOpen: startOfDay(new Date(event.entryStartDate)) <= now && endOfDay(new Date(event.entryEndDate)) >= now
})

export const extendEvents = (events: Event[], now = new Date()): EventEx[] => events.map((event) => extendEvent(event, now))
