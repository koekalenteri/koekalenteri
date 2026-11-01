import type { DayKey, DogEvent } from '@/types'
import { createStore } from 'jotai'
import { emptyEvent } from '@/__mockData__/emptyEvent'
import { adminEventFilterTextAtom, adminEventIdAtom, adminEventsAtom, adminShowFinishedEventsAtom } from './atoms'
import {
  adminCurrentEventAtom,
  adminEventAtom,
  adminEventOrganizersAtom,
  adminFilteredEventsAtom,
  adminLinkedKcGuidsAtom,
} from './derivedAtoms'

const event = (id: string, endDate: DayKey): DogEvent => ({
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

  // An ended trial is still the secretary's work until its results are out (KOE-1667): it leaves the
  // default list when they are published in every class, when it was cancelled, or 30 days on.
  const defaultList = (events: DogEvent[]) => {
    const store = createStore()
    store.set(adminEventsAtom, events)
    store.set(adminEventFilterTextAtom, '')
    store.set(adminShowFinishedEventsAtom, false)
    return store.get(adminFilteredEventsAtom)
  }

  it('keeps a trial that ended yesterday with its results unpublished (KOE-1667)', async () => {
    const today = event('today', '2026-05-28')
    const yesterday = event('yesterday', '2026-05-27')

    expect(await defaultList([today, yesterday])).toEqual([today, yesterday])
  })

  it('keeps a trial whose results are out in only some classes (KOE-1667)', async () => {
    const partly: DogEvent = {
      ...event('partly', '2026-05-27'),
      classes: [
        { class: 'ALO', date: '2026-05-27' },
        { class: 'AVO', date: '2026-05-27' },
      ],
      resultsPublished: { ALO: true },
    }

    expect(await defaultList([partly])).toEqual([partly])
  })

  it('drops a trial whose results are out in every class (KOE-1667)', async () => {
    const published: DogEvent = { ...event('published', '2026-05-27'), resultsPublished: { ALO: true } }

    expect(await defaultList([published])).toEqual([])
  })

  it('drops a cancelled trial once its day is over (KOE-1667)', async () => {
    const cancelled: DogEvent = { ...event('cancelled', '2026-05-27'), state: 'cancelled' }

    expect(await defaultList([cancelled])).toEqual([])
  })

  it('keeps an ended trial for 29 days and drops it on the 30th (KOE-1667)', async () => {
    const day29 = event('day29', '2026-04-29')
    const day30 = event('day30', '2026-04-28')

    expect(await defaultList([day29, day30])).toEqual([day29])
  })

  // The list shows an English user the English name (KOE-1453), so the search finds an event by its
  // name in any language, whatever the UI language, and a search may span the name and the fields
  // beside it in the list, as it did before translations.
  const named: DogEvent = {
    ...event('named', '2026-06-10'),
    eventType: 'NOME-B',
    location: 'Vaasa',
    name: 'Syyskoe',
    names: { en: 'Autumn trial' },
  }
  const other = event('other', '2026-06-10')

  const search = (filter: string) => {
    const store = createStore()
    store.set(adminEventsAtom, [named, other])
    store.set(adminEventFilterTextAtom, filter)
    store.set(adminShowFinishedEventsAtom, false)
    return store.get(adminFilteredEventsAtom)
  }

  it.each([
    ['its English name', 'autumn'],
    ['its Finnish name', 'syyskoe'],
    ['its Finnish name and place', 'syyskoe vaasa'],
    ['its English name and place', 'autumn trial vaasa'],
    ['its event type and English name', 'nome-b autumn'],
  ])('finds an event by %s', async (_case, filter) => {
    expect(await search(filter)).toEqual([named])
  })

  it('does not join a translated name to the fields of another name', async () => {
    // "Sihteeri" ends the Finnish line and "Autumn" starts no line after it.
    expect(await search('sihteeri autumn')).toEqual([])
  })

  it('serves the selected event synchronously once the events have loaded', () => {
    const selected = event('selected', '2026-05-28')
    const other = event('other', '2026-05-29')

    const store = createStore()
    store.set(adminEventsAtom, [other, selected])
    store.set(adminEventIdAtom, 'selected')

    // A Promise here would suspend the event list on every row selection.
    expect(store.get(adminCurrentEventAtom)).toBe(selected)
  })

  it('puts a newly saved event in date order instead of at the end of the list (KOE-1302)', async () => {
    const june = event('june', '2026-06-10')
    const august = event('august', '2026-08-10')
    const july = event('july', '2026-07-10')

    const store = createStore()
    store.set(adminEventsAtom, [june, august])

    await store.set(adminEventAtom(july.id), july)

    expect((await store.get(adminEventsAtom)).map((item) => item.id)).toEqual(['june', 'july', 'august'])
  })

  it('moves a redated event to its new place in the list (KOE-1302)', async () => {
    const june = event('june', '2026-06-10')
    const july = event('july', '2026-07-10')
    const august = event('august', '2026-08-10')

    const store = createStore()
    store.set(adminEventsAtom, [june, july, august])

    const redated = event('june', '2026-09-10')
    await store.set(adminEventAtom(redated.id), redated)

    expect((await store.get(adminEventsAtom)).map((item) => item.id)).toEqual(['july', 'august', 'june'])
  })

  describe('Kennelliitto trials already linked (KOE-1534)', () => {
    const linked = (id: string, kcGuid: string, deletedAt?: Date): DogEvent => ({
      ...event(id, '2026-06-10'),
      deletedAt,
      kcGuid,
    })

    it('lists the GUIDs of the other events', async () => {
      const store = createStore()
      store.set(adminEventsAtom, [linked('a', 'guid-a'), linked('b', 'guid-b')])

      expect(await store.get(adminLinkedKcGuidsAtom('a'))).toEqual(new Set(['guid-b']))
    })

    it('does not count a deleted event, which keeps its GUID but no longer holds the trial', async () => {
      const store = createStore()
      store.set(adminEventsAtom, [linked('a', 'guid-a'), linked('b', 'guid-b', new Date('2026-05-01T00:00:00.000Z'))])

      expect(await store.get(adminLinkedKcGuidsAtom('a'))).toEqual(new Set())
    })
  })

  it('ignores events with missing organizers when listing event organizers', async () => {
    const valid = {
      ...event('valid', '2026-05-28'),
      organizer: { id: 'org-1', name: 'Organizer' },
    }
    const missingOrganizer = {
      ...event('missing-organizer', '2026-05-28'),
      organizer: undefined,
      // Deliberately missing the organizer, to cover the defensive path
    } as unknown as DogEvent

    const store = createStore()
    store.set(adminEventsAtom, [missingOrganizer, valid])

    expect(await store.get(adminEventOrganizersAtom)).toEqual([valid.organizer])
  })
})
