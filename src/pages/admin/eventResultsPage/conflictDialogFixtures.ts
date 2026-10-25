import type { Registration } from '@/types'
import type { ResultConflict } from './ConflictDialog'
import { registrationsToEventWithStations } from '@/__mockData__/resultsEvent'

const at = new Date('2026-10-21T10:00:00Z')
const [first] = registrationsToEventWithStations

/** A NOME-A dog: no class, so its results are stored under the event type, as NOME-A1. */
export const nomeAConflictRegistrations: Registration[] = [{ ...first, class: undefined, eventType: 'NOME-A' }]

/**
 * Another secretary saved a nought while this one entered a first prize. Both read as KoiraNet lists
 * them, A0 and A1, though they are stored as NOME-A0 and NOME-A1 (KOE-1592).
 */
export const nomeAConflicts: ResultConflict[] = [
  {
    id: first.id,
    stored: { result: 'NOME-A0', updatedAt: at, updatedBy: 'Toinen sihteeri' },
    submitted: { result: 'NOME-A1', updatedAt: at, updatedBy: 'Sihteeri' },
  },
]
