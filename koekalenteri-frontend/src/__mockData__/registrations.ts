import { Registration } from 'koekalenteri-shared/model'

import { registrationDogAged10MonthsAndNoResults, registrationDogAged20MonthsAndNoResults } from './dogs'
import { eventWithStaticDates } from './events'

export const registrationWithStaticDates: Registration = {
  id: 'minimal-registration',
  eventId: eventWithStaticDates.id,
  eventType: eventWithStaticDates.eventType,
  createdAt: eventWithStaticDates.entryStartDate,
  modifiedAt: eventWithStaticDates.entryStartDate,
  createdBy: 'anonymous',
  modifiedBy: 'anonymous',
  agreeToPublish: true,
  agreeToTerms: true,
  dates: [{date: eventWithStaticDates.startDate, time: 'ap'}],
  breeder: {
    name: 'Breeder Name',
    location: 'Breeder Location',
  },
  handler: {
    name: 'Handler Name',
    location: 'Handler Location',
    email: 'handler@exmaple.com',
    phone: '0700-handler',
    membership: false,
  },
  owner: {
    name: 'Owner Name',
    location: 'Owner Location',
    email: 'owner@exmaple.com',
    phone: '0700-owner',
    membership: false,
  },
  language: 'fi',
  notes: 'additional notes',
  qualifyingResults: [],
  reserve: 'ANY',
  dog: registrationDogAged10MonthsAndNoResults,
}

export const registrationWithStaticDatesCancelled: Registration = {
  id: 'cancelled-registration',
  eventId: eventWithStaticDates.id,
  eventType: eventWithStaticDates.eventType,
  createdAt: eventWithStaticDates.entryStartDate,
  modifiedAt: eventWithStaticDates.entryStartDate,
  createdBy: 'anonymous',
  modifiedBy: 'anonymous',
  agreeToPublish: true,
  agreeToTerms: true,
  cancelled: true,
  dates: [{date: eventWithStaticDates.startDate, time: 'ap'}],
  breeder: {
    name: 'Breeder Name',
    location: 'Breeder Location',
  },
  handler: {
    name: 'Handler Name',
    location: 'Handler Location',
    email: 'handler@exmaple.com',
    phone: '0700-handler',
    membership: false,
  },
  owner: {
    name: 'Owner Name',
    location: 'Owner Location',
    email: 'owner@exmaple.com',
    phone: '0700-owner',
    membership: false,
  },
  language: 'fi',
  notes: 'additional notes',
  qualifyingResults: [],
  reserve: 'ANY',
  dog: registrationDogAged20MonthsAndNoResults,
}
