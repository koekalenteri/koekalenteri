import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import type { DogEvent } from '../../../../types'
import { newEventEntryEndDate, newEventEntryStartDate, newEventStartDate } from '../../../../lib/event'
import { atomWithLocalStorage } from '../../../state/storage'

export { adminEventsRemoteAtom as adminEventsAtom } from './remoteAtoms'
// A new event draft is intentionally incomplete; the event form fills in the rest of DogEvent
// before anything is saved, so the conversion below is deliberate.
export const adminNewEventAtom = atomWithLocalStorage<DogEvent>('newEvent', {
  classes: [],
  endDate: newEventStartDate,
  entryEndDate: newEventEntryEndDate,
  entryStartDate: newEventEntryStartDate,
  judges: [{ id: 0, name: '', official: true }],
  startDate: newEventStartDate,
  startListPublished: false,
  state: 'draft',
} as unknown as DogEvent)
export const adminShowPastEventsAtom = atomWithLocalStorage('adminShowPastEvents', false)
export const adminEventFilterTextAtom = atomWithLocalStorage('adminEventFilterText', '')
export const adminEventIdAtom = atomWithLocalStorage<string | undefined>('adminEventId', undefined)
export const adminEventOrganizerIdAtom = atomWithLocalStorage('adminEventOrganizerId', '')
export const adminEventColumnsAtom = atomWithLocalStorage<GridColumnVisibilityModel>('adminEventColumns', { id: false })
