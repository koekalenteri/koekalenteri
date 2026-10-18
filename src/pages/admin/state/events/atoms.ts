import type { GridColumnVisibilityModel } from '@mui/x-data-grid'
import type { DogEvent, JsonDogEvent } from '@/types'
import { newEventDates } from '@/lib/event'
import { toDogEvent } from '@/lib/wire'
import { atomWithLocalStorage } from '@/pages/state/storage'

export { adminEventsRemoteAtom as adminEventsAtom } from './remoteAtoms'
// A new event draft is intentionally incomplete; the event form fills in the rest of DogEvent
// before anything is saved, so the conversion below is deliberate.
// The clock is read when this module loads: the dates are only the default before the first draft is
// stored, and a lazily built default is a change to the storage atom, not to the dates.
export const adminNewEventAtom = atomWithLocalStorage<DogEvent, JsonDogEvent>(
  'newEvent',
  {
    classes: [],
    ...newEventDates(new Date()),
    judges: [{ id: 0, name: '', official: true }],
    startListPublished: false,
    state: 'draft',
  } as unknown as DogEvent,
  { revive: toDogEvent }
)
export const adminShowPastEventsAtom = atomWithLocalStorage('adminShowPastEvents', false)
export const adminEventFilterTextAtom = atomWithLocalStorage('adminEventFilterText', '')
export const adminEventIdAtom = atomWithLocalStorage<string | undefined>('adminEventId', undefined)
export const adminEventOrganizerIdAtom = atomWithLocalStorage('adminEventOrganizerId', '')
export const adminEventColumnsAtom = atomWithLocalStorage<GridColumnVisibilityModel>('adminEventColumns', { id: false })
