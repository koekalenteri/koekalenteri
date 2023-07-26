import type { Registration } from 'koekalenteri-shared/model'

import {
  registrationDogAged10MonthsAndNoResults,
  registrationDogAged20MonthsAndNoResults,
  registrationDogAged28MonthsWithNOUResult,
} from './dogs'
import {
  eventWithEntryClosed,
  eventWithParticipantsInvited,
  eventWithStaticDates,
  eventWithStaticDatesAndClass,
} from './events'

const mockRegistrationDefaults = {
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
    email: 'handler@exmaple.com',
    phone: '+3584054321',
    membership: false,
  },
  owner: {
    name: 'Owner Name',
    location: 'Owner Location',
    email: 'owner@exmaple.com',
    phone: '+3584012345',
    membership: false,
  },
  language: 'fi' as const,
  notes: 'additional notes',
  qualifyingResults: [],
  reserve: 'ANY' as const,
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
    email: 'handler@exmaple.com',
    phone: '+3584054321',
    membership: false,
  },
  owner: {
    name: 'Owner Name',
    location: 'Owner Location',
    email: 'owner@exmaple.com',
    phone: '+3584012345',
    membership: false,
  },
  language: 'fi',
  notes: 'additional notes',
  qualifyingResults: [],
  reserve: 'ANY',
  dog: registrationDogAged10MonthsAndNoResults,
}

export const registrationWithStaticDatesAndClass: Registration = {
  ...registrationWithStaticDates,

  id: 'nome-b-alo-registration',
  eventId: eventWithStaticDatesAndClass.id,
  eventType: eventWithStaticDatesAndClass.eventType,
  class: 'ALO',
  createdAt: eventWithStaticDatesAndClass.entryStartDate,
  modifiedAt: eventWithStaticDatesAndClass.entryStartDate,
  qualifyingResults: registrationDogAged28MonthsWithNOUResult.results.map((r) => ({ ...r, official: true })),
  dog: registrationDogAged28MonthsWithNOUResult,
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

const registrationToEventWithEntryClosedBase = {
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
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    id: eventWithParticipantsInvited.id + '2',
    class: 'ALO',
    dates: [
      { date: eventWithParticipantsInvited.startDate, time: 'ap' },
      { date: eventWithParticipantsInvited.startDate, time: 'ip' },
    ],
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    id: eventWithParticipantsInvited.id + '3',
    class: 'AVO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ap' }],
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    id: eventWithParticipantsInvited.id + '4',
    class: 'AVO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ip' }],
  },
  {
    ...registrationToEventWithParticipantsInvitedBase,
    id: eventWithParticipantsInvited.id + '5',
    class: 'ALO',
    dates: [{ date: eventWithParticipantsInvited.startDate, time: 'ip' }],
    cancelled: true,
    cancelReason: 'koska mä voin',
  },
]

export const mockRegistrationData = [
  registrationWithStaticDates,
  registrationWithStaticDatesAndClass,
  registrationWithManualResults,
  registrationWithStaticDatesCancelled,
  ...registrationsToEventWithParticipantsInvited,
]
