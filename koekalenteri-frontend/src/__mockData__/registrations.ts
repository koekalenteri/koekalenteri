import { Registration } from 'koekalenteri-shared/model'

import { registrationDogAged10MonthsAndNoResults, registrationDogAged20MonthsAndNoResults, registrationDogAged28MonthsWithNOUResult } from './dogs'
import { eventWithStaticDates, eventWithStaticDatesAndClass } from './events'

export const registrationWithStaticDates: Registration = {
  id: 'nou-registration',
  eventId: eventWithStaticDates.id,
  eventType: eventWithStaticDates.eventType,
  createdAt: eventWithStaticDates.entryStartDate,
  modifiedAt: eventWithStaticDates.entryStartDate,
  createdBy: 'anonymous',
  modifiedBy: 'anonymous',
  agreeToPublish: true,
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

export const registrationWithStaticDatesAndClass: Registration = {
  ...registrationWithStaticDates,

  id: 'nome-b-alo-registration',
  eventId: eventWithStaticDatesAndClass.id,
  eventType: eventWithStaticDatesAndClass.eventType,
  class: 'ALO',
  createdAt: eventWithStaticDatesAndClass.entryStartDate,
  modifiedAt: eventWithStaticDatesAndClass.entryStartDate,
  qualifyingResults: registrationDogAged28MonthsWithNOUResult.results.map(r => ({ ...r, official: true })),
  dog: registrationDogAged28MonthsWithNOUResult,
}

export const registrationWithManualResults: Registration = {
  ...registrationWithStaticDatesAndClass,
  class: 'AVO',
  results: [{
    id: 'manual-result-1',
    regNo: registrationWithStaticDatesAndClass.dog.regNo,
    official: false,
    type: 'NOME-B',
    class: 'ALO',
    result: 'ALO1',
    date: registrationWithStaticDatesAndClass.createdAt,
    judge: 'Manual Judge',
    location: 'Somewhere',
  }, {
    id: 'manual-result-2',
    regNo: registrationWithStaticDatesAndClass.dog.regNo,
    official: false,
    type: 'NOME-B',
    class: 'ALO',
    result: 'ALO1',
    date: registrationWithStaticDatesAndClass.createdAt,
    judge: 'Manual Judge 2',
    location: 'Somewhere Else',
  }],
}

export const registrationWithStaticDatesCancelled: Registration = {
  ...registrationWithStaticDates,

  id: 'cancelled-registration',
  cancelled: true,
  dog: registrationDogAged20MonthsAndNoResults,
}
