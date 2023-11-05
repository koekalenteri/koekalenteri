import type { JsonEvent } from '../../types'

import { addMonths, startOfDay } from 'date-fns'

const today = startOfDay(new Date()).toISOString()
const timestamp = new Date().toISOString()
const startDate = startOfDay(addMonths(Date.now(), 1)).toISOString()

const draftNOMEA: JsonEvent = {
  accountNumber: '',
  classes: [],
  cost: 0,
  costMember: 0,
  createdAt: timestamp,
  createdBy: 'cron',
  description: '',
  endDate: startDate,
  eventType: 'NOME-A',
  id: 'demo-draft-nome-a',
  judges: [],
  location: '',
  modifiedAt: timestamp,
  modifiedBy: 'cron',
  name: 'DEMO: Alustava NOME-A +1kk',
  official: {
    district: 'demo',
    email: 'vastaava@example.com',
    eventTypes: ['NOMA-A'],
    id: 0,
    name: 'Demo Koevastaava',
  },
  organizer: {
    id: '400830',
    name: 'SUOMEN NOUTAJAKOIRAJÄRJESTÖ R.Y.',
  },
  paymentDetails: '',
  places: 0,
  referenceNumber: '',
  secretary: {
    email: 'sihteeri@example.com',
    id: 'demo-sihteeri',
    name: 'Demo Sihteeri',
  },
  startDate: startDate,
  state: 'draft',
}

const draftNOMEAWithEntry: JsonEvent = {
  ...draftNOMEA,
  id: 'demo-draft-nome-a-entry',
  entryStartDate: today,
}

const tentativeNOMEA: JsonEvent = {
  ...draftNOMEA,
  id: 'demo-tentative-nome-a',
  location: 'demo',
}

const tentativeNOMEAWithEntry: JsonEvent = {
  ...draftNOMEAWithEntry,
  id: 'demo-tentative-nome-a-entry',
  location: 'demo',
}

export const events = [draftNOMEA, draftNOMEAWithEntry, tentativeNOMEA, tentativeNOMEAWithEntry]
