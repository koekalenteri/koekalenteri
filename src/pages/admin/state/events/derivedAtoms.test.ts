import type { DogEvent } from '@/types'
import { createStore } from 'jotai'
import { emptyEvent } from '@/__mockData__/emptyEvent'
import { adminEventFilterTextAtom, adminEventIdAtom, adminEventsAtom, adminShowPastEventsAtom } from './atoms'
import {
  adminCurrentEventAtom,
  adminEventAtom,
  adminEventOrganizersAtom,
  adminFilteredEventsAtom,
} from './derivedAtoms'

const event = (id: string, endDate: Date): DogEvent => ({
  ...emptyEvent,
  endDate,
  id,
  name: `Tapahtuma ${id}`,
  startDate: endDate,
})

describe('admin event derived atoms', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-28T12:00:00.000+03:00'))
  })

  afterEach(async () => {
    await vi.advanceTimersByTimeAsync(20)
    vi.useRealTimers()
  })

  it('keeps events ending today visible when past events are hidden', async () => {
    const today = event('today', new Date('2026-05-28T00:00:00.000+03:00'))
    const yesterday = event('yesterday', new Date('2026-05-27T00:00:00.000+03:00'))

    const store = createStore()
    store.set(adminEventsAtom, [today, yesterday])
    store.set(adminEventFilterTextAtom, '')
    store.set(adminShowPastEventsAtom, false)

    await expect(store.get(adminFilteredEventsAtom)).resolves.toEqual([today])
  })

  // The list shows an English user the English name (KOE-1453), so the search finds an event by its
  // name in any language, whatever the UI language, and a search may span the name and the fields
  // beside it in the list, as it did before translations.
  const named: DogEvent = {
    ...event('named', new Date('2026-06-10T00:00:00.000+03:00')),
    eventType: 'NOME-B',
    location: 'Vaasa',
    name: 'Syyskoe',
    names: { en: 'Autumn trial' },
  }
  const other = event('other', new Date('2026-06-10T00:00:00.000+03:00'))

  const search = (filter: string) => {
    const store = createStore()
    store.set(adminEventsAtom, [named, other])
    store.set(adminEventFilterTextAtom, filter)
    store.set(adminShowPastEventsAtom, false)
    return store.get(adminFilteredEventsAtom)
  }

  it.each([
    ['its English name', 'autumn'],
    ['its Finnish name', 'syyskoe'],
    ['its Finnish name and place', 'syyskoe vaasa'],
    ['its English name and place', 'autumn trial vaasa'],
    ['its event type and English name', 'nome-b autumn'],
  ])('finds an event by %s', async (_case, filter) => {
    await expect(search(filter)).resolves.toEqual([named])
  })

  it('does not join a translated name to the fields of another name', async () => {
    // "Sihteeri" ends the Finnish line and "Autumn" starts no line after it.
    await expect(search('sihteeri autumn')).resolves.toEqual([])
  })

  it('serves the selected event synchronously once the events have loaded', () => {
    const selected = event('selected', new Date('2026-05-28T00:00:00.000+03:00'))
    const other = event('other', new Date('2026-05-29T00:00:00.000+03:00'))

    const store = createStore()
    store.set(adminEventsAtom, [other, selected])
    store.set(adminEventIdAtom, 'selected')

    // A Promise here would suspend the event list on every row selection.
    expect(store.get(adminCurrentEventAtom)).toBe(selected)
  })

  it('puts a newly saved event in date order instead of at the end of the list (KOE-1302)', async () => {
    const june = event('june', new Date('2026-06-10T00:00:00.000+03:00'))
    const august = event('august', new Date('2026-08-10T00:00:00.000+03:00'))
    const july = event('july', new Date('2026-07-10T00:00:00.000+03:00'))

    const store = createStore()
    store.set(adminEventsAtom, [june, august])

    await store.set(adminEventAtom(july.id), july)

    expect((await store.get(adminEventsAtom)).map((item) => item.id)).toEqual(['june', 'july', 'august'])
  })

  it('moves a redated event to its new place in the list (KOE-1302)', async () => {
    const june = event('june', new Date('2026-06-10T00:00:00.000+03:00'))
    const july = event('july', new Date('2026-07-10T00:00:00.000+03:00'))
    const august = event('august', new Date('2026-08-10T00:00:00.000+03:00'))

    const store = createStore()
    store.set(adminEventsAtom, [june, july, august])

    const redated = event('june', new Date('2026-09-10T00:00:00.000+03:00'))
    await store.set(adminEventAtom(redated.id), redated)

    expect((await store.get(adminEventsAtom)).map((item) => item.id)).toEqual(['july', 'august', 'june'])
  })

  it('ignores events with missing organizers when listing event organizers', async () => {
    const valid = {
      ...event('valid', new Date('2026-05-28T00:00:00.000+03:00')),
      organizer: { id: 'org-1', name: 'Organizer' },
    }
    const missingOrganizer = {
      ...event('missing-organizer', new Date('2026-05-28T00:00:00.000+03:00')),
      organizer: undefined,
      // Deliberately missing the organizer, to cover the defensive path
    } as unknown as DogEvent

    const store = createStore()
    store.set(adminEventsAtom, [missingOrganizer, valid])

    await expect(store.get(adminEventOrganizersAtom)).resolves.toEqual([valid.organizer])
  })
})
