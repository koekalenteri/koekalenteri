import type { JsonRegistration, Registration } from '../types'

import {
  registrationDogAged10MonthsAndNoResults,
  registrationDogAged20MonthsAndNoResults,
  registrationDogAged28MonthsWithNOUResult,
} from './dogs'
import {
  eventWithALOClassInvited,
  eventWithEntryClosed,
  eventWithParticipantsInvited,
  eventWithStaticDates,
  eventWithStaticDatesAndClass,
} from './events'

const mockRegistrationDefaults: Omit<
  Registration,
  'id' | 'createdAt' | 'modifiedAt' | 'eventId' | 'eventType' | 'dates' | 'dog'
> = {
  createdBy: 'anonymous',
  modifiedBy: 'anonymous',
  agreeToTerms: true,
  breeder: {
    name: 'Breeder Name',
    location: 'Breeder Location',
  },
  handler: {
    name: 'Handler Name',
    location: 'Handler Location',
    email: 'handler@example.com',
    phone: '+3584054321',
    membership: false,
  },
  owner: {
    name: 'Owner Name',
    location: 'Owner Location',
    email: 'owner@example.com',
    phone: '+3584012345',
    membership: false,
  },
  payer: {
    name: 'Payer Name',
    email: 'payer@exmaple.com',
    phone: '+3584055555',
  },
  language: 'fi' as const,
  notes: 'additional notes',
  qualifies: true,
  qualifyingResults: [],
  reserve: 'ANY' as const,
  state: 'ready' as const,
  cancelled: false,
}

export const registrationWithStaticDates: Registration = {
  id: 'nou-registration',
  eventId: eventWithStaticDates.id,
  eventType: eventWithStaticDates.eventType,
  createdAt: eventWithStaticDates.entryStartDate,
  modifiedAt: eventWithStaticDates.entryStartDate,
  createdBy: 'anonymous',
  modifiedBy: 'anonymous',
  agreeToTerms: true,
  dates: [{ date: eventWithStaticDates.startDate, time: 'ap' }],
  breeder: {
    name: 'Breeder Name',
    location: 'Breeder Location',
  },
  handler: {
    name: 'Handler Name',
    location: 'Handler Location',
    email: 'handler@example.com',
    phone: '+3584054321',
    membership: false,
  },
  owner: {
    name: 'Owner Name',
    location: 'Owner Location',
    email: 'owner@example.com',
    phone: '+3584012345',
    membership: false,
  },
  payer: {
    name: 'Owner Name',
    email: 'owner@example.com',
    phone: '+3584012345',
  },
  language: 'fi',
  notes: 'additional notes',
  qualifies: true,
  qualifyingResults: [],
  reserve: 'ANY',
  dog: registrationDogAged10MonthsAndNoResults,
  paidAt: eventWithStaticDates.entryStartDate,
  paidAmount: 123,
  paymentStatus: 'SUCCESS',
}

export const unpaidRegistrationWithStaticDates: Registration = {
  ...registrationWithStaticDates,
  id: 'unpaid-nou-registration',
  paidAt: undefined,
  paidAmount: undefined,
  paymentStatus: undefined,
}

export const unpaidPickedRegistrationWithStaticDates: Registration = {
  ...unpaidRegistrationWithStaticDates,
  id: 'unpaid-picked-nou-registration',
  messagesSent: {
    picked: true,
  },
}
export const paidAndPickedRegistrationWithStaticDates: Registration = {
  ...registrationWithStaticDates,
  id: 'paid-and-picked-nou-registration',
  paymentStatus: 'SUCCESS',
  messagesSent: {
    picked: true,
  },
}
export const invitationAttachmentRegistration: Registration = {
  ...registrationWithStaticDates,
  eventId: 'testInvited',
  id: 'invitation-attachment-registration',
  invitationAttachment: 'attachment-file',
}

export const registrationWithStaticDatesAndClass: Registration = {
  ...registrationWithStaticDates,

  id: 'nome-b-alo-registration',
  eventId: eventWithStaticDatesAndClass.id,
  eventType: eventWithStaticDatesAndClass.eventType,
  class: 'ALO',
  createdAt: eventWithStaticDatesAndClass.entryStartDate,
  modifiedAt: eventWithStaticDatesAndClass.entryStartDate,
  qualifies: true,
  qualifyingResults: registrationDogAged28MonthsWithNOUResult.results.map((r) => ({ ...r, official: true })),
  dog: registrationDogAged28MonthsWithNOUResult,
}

export const unpaidRegistrationWithStaticDatesAndClass: Registration = {
  ...registrationWithStaticDates,
  id: 'unpaid-nome-b-alo-registration',
  paidAt: undefined,
  paidAmount: undefined,
  paymentStatus: undefined,
}

export const registrationWithManualResults: Registration = {
  ...registrationWithStaticDatesAndClass,
  class: 'AVO',
  results: [
    {
      id: 'manual-result-1',
      regNo: registrationWithStaticDatesAndClass.dog.regNo,
      official: false,
      type: 'NOME-B',
      class: 'ALO',
      result: 'ALO1',
      date: registrationWithStaticDatesAndClass.createdAt,
      judge: 'Manual Judge',
      location: 'Somewhere',
    },
    {
      id: 'manual-result-2',
      regNo: registrationWithStaticDatesAndClass.dog.regNo,
      official: false,
      type: 'NOME-B',
      class: 'ALO',
      result: 'ALO1',
      date: registrationWithStaticDatesAndClass.createdAt,
      judge: 'Manual Judge 2',
      location: 'Somewhere Else',
    },
  ],
}

export const registrationWithStaticDatesCancelled: Registration = {
  ...registrationWithStaticDates,

  id: 'cancelled-registration',
  cancelled: true,
  dog: registrationDogAged20MonthsAndNoResults,
}

const registrationToEventWithEntryClosedBase: Omit<Registration, 'id' | 'dates'> = {
  ...mockRegistrationDefaults,
  eventId: eventWithEntryClosed.id,
  eventType: eventWithEntryClosed.eventType,
  dog: registrationDogAged28MonthsWithNOUResult,
  createdAt: eventWithEntryClosed.entryStartDate,
  modifiedAt: eventWithEntryClosed.entryEndDate,
}

export const registrationsToEventWithEntryClosed: Registration[] = [
  {
    ...registrationToEventWithEntryClosedBase,
    id: eventWithEntryClosed.id + '1',
    class: 'ALO',
    dates: [{ date: eventWithEntryClosed.startDate, time: 'ap' }],
  },
  {
    ...registrationToEventWithEntryClosedBase,
    id: eventWithEntryClosed.id + '2',
    class: 'ALO',
    dates: [
      { date: eventWithEntryClosed.startDate, time: 'ap' },
      { date: eventWithEntryClosed.startDate, time: 'ip' },
    ],
  },
  {
    ...registrationToEventWithEntryClosedBase,
    id: eventWithEntryClosed.id + '3',
    class: 'AVO',
    dates: [{ date: eventWithEntryClosed.startDate, time: 'ap' }],
  },
  {
    ...registrationToEventWithEntryClosedBase,
    id: eventWithEntryClosed.id + '4',
    class: 'AVO',
    dates: [{ date: eventWithEntryClosed.startDate, time: 'ip' }],
  },
  {
    ...registrationToEventWithEntryClosedBase,
    id: eventWithEntryClosed.id + '5',
    class: 'ALO',
    dates: [{ date: eventWithEntryClosed.startDate, time: 'ip' }],
    cancelled: true,
    cancelReason: 'koska mä voin',
  },
]

const registrationToEventWithParticipantsInvitedBase = {
  ...mockRegistrationDefaults,
  eventId: eventWithParticipantsInvited.id,
  eventType: eventWithParticipantsInvited.eventType,
  dog: registrationDogAged28MonthsWithNOUResult,
  createdAt: eventWithParticipantsInvited.entryStartDate,
  modifiedAt: eventWithParticipantsInvited.entryEndDate,
}

export const registrationsToEventWithParticipantsInvited: Registration[] = [
  {
    ...registrationToEventWithParticipantsInvitedBase,
    id: eventWithParticipantsInvited.id + '1',
    class: 'ALO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ap' }],
    group: { date: eventWithParticipantsInvited.startDate, time: 'ap', number: 1, key: 'ALO-AP' },
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    id: eventWithParticipantsInvited.id + '2',
    class: 'ALO',
    dates: [
      { date: eventWithParticipantsInvited.startDate, time: 'ap' },
      { date: eventWithParticipantsInvited.startDate, time: 'ip' },
    ],
    group: { date: eventWithParticipantsInvited.startDate, time: 'ip', number: 2, key: 'ALO-IP' },
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    id: eventWithParticipantsInvited.id + '3',
    class: 'AVO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ap' }],
    group: { date: eventWithParticipantsInvited.startDate, time: 'ap', number: 3, key: 'AVO-AP' },
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    id: eventWithParticipantsInvited.id + '4',
    class: 'AVO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ip' }],
    group: { date: eventWithParticipantsInvited.startDate, time: 'ip', number: 4, key: 'AVO-IP' },
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    id: eventWithParticipantsInvited.id + '5',
    class: 'ALO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ip' }],
    cancelled: true,
    cancelReason: 'koska mä voin',
    group: { number: 1, key: 'cancelled' },
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    id: eventWithParticipantsInvited.id + '6',
    class: 'ALO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ap' }],
    group: { number: 1, key: 'reserve' },
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    id: eventWithParticipantsInvited.id + '7',
    class: 'ALO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ap' }],
    group: { number: 2, key: 'reserve' },
  },
]

export const jsonRegistrationsToEventWithParticipantsInvited: JsonRegistration[] = JSON.parse(
  JSON.stringify(registrationsToEventWithParticipantsInvited)
)

export const jsonRegistrationsToEventWithALOInvited: JsonRegistration[] =
  jsonRegistrationsToEventWithParticipantsInvited.map((r, i) => ({
    ...r,
    eventId: eventWithALOClassInvited.id,
    id: `${eventWithALOClassInvited.id}${i + 1}`,
  }))

export const mockRegistrationData = [
  registrationWithStaticDates,
  unpaidRegistrationWithStaticDates,
  unpaidPickedRegistrationWithStaticDates,
  paidAndPickedRegistrationWithStaticDates,
  invitationAttachmentRegistration,
  registrationWithStaticDatesAndClass,
  unpaidRegistrationWithStaticDatesAndClass,
  registrationWithManualResults,
  registrationWithStaticDatesCancelled,
  ...registrationsToEventWithParticipantsInvited,
]
