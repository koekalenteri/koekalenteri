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
  agreeToTerms: true,
  breeder: {
    location: 'Breeder Location',
    name: 'Breeder Name',
  },
  cancelled: false,
  createdBy: 'anonymous',
  handler: {
    email: 'handler@example.com',
    location: 'Handler Location',
    membership: false,
    name: 'Handler Name',
    phone: '+3584054321',
  },
  language: 'fi' as const,
  modifiedBy: 'anonymous',
  notes: 'additional notes',
  owner: {
    email: 'owner@example.com',
    location: 'Owner Location',
    membership: false,
    name: 'Owner Name',
    phone: '+3584012345',
  },
  payer: {
    email: 'payer@exmaple.com',
    name: 'Payer Name',
    phone: '+3584055555',
  },
  qualifies: true,
  qualifyingResults: [],
  reserve: 'ANY' as const,
  state: 'ready' as const,
}

export const registrationWithStaticDates: Registration = {
  agreeToTerms: true,
  breeder: {
    location: 'Breeder Location',
    name: 'Breeder Name',
  },
  createdAt: eventWithStaticDates.entryStartDate,
  createdBy: 'anonymous',
  dates: [{ date: eventWithStaticDates.startDate, time: 'ap' }],
  dog: registrationDogAged10MonthsAndNoResults,
  eventId: eventWithStaticDates.id,
  eventType: eventWithStaticDates.eventType,
  handler: {
    email: 'handler@example.com',
    location: 'Handler Location',
    membership: false,
    name: 'Handler Name',
    phone: '+3584054321',
  },
  id: 'nou-registration',
  language: 'fi',
  modifiedAt: eventWithStaticDates.entryStartDate,
  modifiedBy: 'anonymous',
  notes: 'additional notes',
  owner: {
    email: 'owner@example.com',
    location: 'Owner Location',
    membership: false,
    name: 'Owner Name',
    phone: '+3584012345',
  },
  paidAmount: 123,
  paidAt: eventWithStaticDates.entryStartDate,
  payer: {
    email: 'owner@example.com',
    name: 'Owner Name',
    phone: '+3584012345',
  },
  paymentStatus: 'SUCCESS',
  qualifies: true,
  qualifyingResults: [],
  reserve: 'ANY',
}

export const unpaidRegistrationWithStaticDates: Registration = {
  ...registrationWithStaticDates,
  id: 'unpaid-nou-registration',
  paidAmount: undefined,
  paidAt: undefined,
  paymentStatus: undefined,
}

const unpaidPickedRegistrationWithStaticDates: Registration = {
  ...unpaidRegistrationWithStaticDates,
  id: 'unpaid-picked-nou-registration',
  messagesSent: {
    picked: true,
  },
}
const paidAndPickedRegistrationWithStaticDates: Registration = {
  ...registrationWithStaticDates,
  id: 'paid-and-picked-nou-registration',
  messagesSent: {
    picked: true,
  },
  paymentStatus: 'SUCCESS',
}
const invitationAttachmentRegistration: Registration = {
  ...registrationWithStaticDates,
  eventId: 'testInvited',
  id: 'invitation-attachment-registration',
  invitationAttachment: 'attachment-file',
}

export const registrationWithStaticDatesAndClass: Registration = {
  ...registrationWithStaticDates,
  class: 'ALO',
  createdAt: eventWithStaticDatesAndClass.entryStartDate,
  dog: registrationDogAged28MonthsWithNOUResult,
  eventId: eventWithStaticDatesAndClass.id,
  eventType: eventWithStaticDatesAndClass.eventType,

  id: 'nome-b-alo-registration',
  modifiedAt: eventWithStaticDatesAndClass.entryStartDate,
  qualifies: true,
  qualifyingResults: registrationDogAged28MonthsWithNOUResult.results.map((r) => ({ ...r, official: true })),
}

export const unpaidRegistrationWithStaticDatesAndClass: Registration = {
  ...registrationWithStaticDates,
  id: 'unpaid-nome-b-alo-registration',
  paidAmount: undefined,
  paidAt: undefined,
  paymentStatus: undefined,
}

export const registrationWithManualResults: Registration = {
  ...registrationWithStaticDatesAndClass,
  class: 'AVO',
  results: [
    {
      class: 'ALO',
      date: registrationWithStaticDatesAndClass.createdAt,
      id: 'manual-result-1',
      judge: 'Manual Judge',
      location: 'Somewhere',
      official: false,
      regNo: registrationWithStaticDatesAndClass.dog.regNo,
      result: 'ALO1',
      type: 'NOME-B',
    },
    {
      class: 'ALO',
      date: registrationWithStaticDatesAndClass.createdAt,
      id: 'manual-result-2',
      judge: 'Manual Judge 2',
      location: 'Somewhere Else',
      official: false,
      regNo: registrationWithStaticDatesAndClass.dog.regNo,
      result: 'ALO1',
      type: 'NOME-B',
    },
  ],
}

export const registrationWithStaticDatesCancelled: Registration = {
  ...registrationWithStaticDates,
  cancelled: true,
  dog: registrationDogAged20MonthsAndNoResults,

  id: 'cancelled-registration',
}

const registrationToEventWithEntryClosedBase: Omit<Registration, 'id' | 'dates'> = {
  ...mockRegistrationDefaults,
  createdAt: eventWithEntryClosed.entryStartDate,
  dog: registrationDogAged28MonthsWithNOUResult,
  eventId: eventWithEntryClosed.id,
  eventType: eventWithEntryClosed.eventType,
  modifiedAt: eventWithEntryClosed.entryEndDate,
}

export const registrationsToEventWithEntryClosed: Registration[] = [
  {
    ...registrationToEventWithEntryClosedBase,
    class: 'ALO',
    dates: [{ date: eventWithEntryClosed.startDate, time: 'ap' }],
    id: `${eventWithEntryClosed.id}1`,
  },
  {
    ...registrationToEventWithEntryClosedBase,
    class: 'ALO',
    dates: [
      { date: eventWithEntryClosed.startDate, time: 'ap' },
      { date: eventWithEntryClosed.startDate, time: 'ip' },
    ],
    id: `${eventWithEntryClosed.id}2`,
  },
  {
    ...registrationToEventWithEntryClosedBase,
    class: 'AVO',
    dates: [{ date: eventWithEntryClosed.startDate, time: 'ap' }],
    id: `${eventWithEntryClosed.id}3`,
  },
  {
    ...registrationToEventWithEntryClosedBase,
    class: 'AVO',
    dates: [{ date: eventWithEntryClosed.startDate, time: 'ip' }],
    id: `${eventWithEntryClosed.id}4`,
  },
  {
    ...registrationToEventWithEntryClosedBase,
    cancelled: true,
    cancelReason: 'koska mä voin',
    class: 'ALO',
    dates: [{ date: eventWithEntryClosed.startDate, time: 'ip' }],
    id: `${eventWithEntryClosed.id}5`,
  },
]

const registrationToEventWithParticipantsInvitedBase = {
  ...mockRegistrationDefaults,
  createdAt: eventWithParticipantsInvited.entryStartDate,
  dog: registrationDogAged28MonthsWithNOUResult,
  eventId: eventWithParticipantsInvited.id,
  eventType: eventWithParticipantsInvited.eventType,
  modifiedAt: eventWithParticipantsInvited.entryEndDate,
}

export const registrationsToEventWithParticipantsInvited: Registration[] = [
  {
    ...registrationToEventWithParticipantsInvitedBase,
    class: 'ALO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ap' }],
    group: { date: eventWithParticipantsInvited.startDate, key: 'ALO-AP', number: 1, time: 'ap' },
    id: `${eventWithParticipantsInvited.id}1`,
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    class: 'ALO',
    dates: [
      { date: eventWithParticipantsInvited.startDate, time: 'ap' },
      { date: eventWithParticipantsInvited.startDate, time: 'ip' },
    ],
    group: { date: eventWithParticipantsInvited.startDate, key: 'ALO-IP', number: 2, time: 'ip' },
    id: `${eventWithParticipantsInvited.id}2`,
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    class: 'AVO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ap' }],
    group: { date: eventWithParticipantsInvited.startDate, key: 'AVO-AP', number: 3, time: 'ap' },
    id: `${eventWithParticipantsInvited.id}3`,
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    class: 'AVO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ip' }],
    group: { date: eventWithParticipantsInvited.startDate, key: 'AVO-IP', number: 4, time: 'ip' },
    id: `${eventWithParticipantsInvited.id}4`,
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    cancelled: true,
    cancelReason: 'koska mä voin',
    class: 'ALO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ip' }],
    group: { key: 'cancelled', number: 1 },
    id: `${eventWithParticipantsInvited.id}5`,
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    class: 'ALO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ap' }],
    group: { key: 'reserve', number: 1 },
    id: `${eventWithParticipantsInvited.id}6`,
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    class: 'ALO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ap' }],
    group: { key: 'reserve', number: 2 },
    id: `${eventWithParticipantsInvited.id}7`,
  },
]

export const jsonRegistrationsToEventWithParticipantsInvited: JsonRegistration[] = JSON.parse(
  JSON.stringify(registrationsToEventWithParticipantsInvited)
)

export const jsonRegistrationsToEventWithALOInvited: JsonRegistration[] =
  jsonRegistrationsToEventWithParticipantsInvited.map((r, i) => ({
    ...r,
    eventId: eventWithALOClassInvited.id,
    handler: r.handler
      ? {
          ...r.handler,
          email: r.handler.email.split('@').join(`${i + 1}@`),
        }
      : r.handler,
    id: `${eventWithALOClassInvited.id}${i + 1}`,
    owner: r.owner
      ? {
          ...r.owner,
          email: r.owner.email.split('@').join(`${i + 1}@`),
        }
      : r.owner,
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
