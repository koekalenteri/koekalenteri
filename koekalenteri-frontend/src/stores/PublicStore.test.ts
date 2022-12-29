import { parseISO } from "date-fns"

import { PublicStore } from "./PublicStore"

jest.mock('../api/event')

test('PublicStore', async () => {

  const store = new PublicStore()

  const emptyFilter = {
    start: null,
    end: null,
    eventType: [],
    eventClass: [],
    judge: [],
    organizer: [],
    withClosingEntry: false,
    withFreePlaces: false,
    withOpenEntry: false,
    withUpcomingEntry: false,
  }

  expect(store.filteredEvents).toEqual([])
  expect(store.loading).toEqual(false)
  expect(store.loaded).toEqual(false)

  /* only gets loaded events at this time
  let evt = await store.get('test4');
  expect(evt?.id).toEqual('test4');
  expect(store.loaded).toEqual(false);
  */

  // empty + defaults
  expect(store.filter).toEqual({ ...emptyFilter, withOpenEntry: true, withUpcomingEntry: true})

  await store.load()
  expect(store.loaded).toEqual(true)
  expect(store.filteredEvents.length).toEqual(3)

  const first = store.filteredEvents[0]
  let evt = await store.get(first.id)
  expect(evt).toEqual(first)

  store.setFilter({ ...emptyFilter })
  expect(store.filteredEvents.length).toEqual(5)

  store.setFilter({
    ...emptyFilter,
    start: parseISO('2021-01-01'),
    end: parseISO('2021-02-11'),
  })
  expect(store.filteredEvents.length).toEqual(1)
  expect(store.filteredEvents[0]).toMatchObject({ id: 'test1' })

  store.setFilter({
    ...emptyFilter,
    start: parseISO('2021-02-13'),
    end: new Date(), // the events relative to today are excluded
  })
  expect(store.filteredEvents.length).toEqual(1)
  expect(store.filteredEvents[0]).toMatchObject({ id: 'test2' })

  store.setFilter({
    ...emptyFilter,
    start: parseISO('2021-02-11'),
    end: parseISO('2021-02-12'),
  })
  expect(store.filteredEvents.length).toEqual(2)

  store.setFilter({
    ...emptyFilter,
    eventType: ['type1'],
  })
  expect(store.filteredEvents.length).toEqual(1)
  expect(store.filteredEvents[0]).toMatchObject({ id: 'test1' })

  store.setFilter({
    ...emptyFilter,
    eventClass: ['class1'],
  })
  expect(store.filteredEvents.length).toEqual(1)
  expect(store.filteredEvents[0]).toMatchObject({ id: 'test1' })

  store.setFilter({
    ...emptyFilter,
    eventType: ['type2'],
    eventClass: ['class1'],
  })
  expect(store.filteredEvents.length).toEqual(0)

  store.setFilter({
    ...emptyFilter,
    judge: [123],
  })
  expect(store.filteredEvents.length).toEqual(1)

  store.setFilter({
    ...emptyFilter,
    organizer: [2],
  })
  expect(store.filteredEvents.length).toEqual(1)

  store.setFilter({
    ...emptyFilter,
    withOpenEntry: true,
  })
  expect(store.filteredEvents.length).toEqual(2)
  expect(store.filteredEvents[0]).toMatchObject({ id: 'test3' })
  expect(store.filteredEvents[1]).toMatchObject({ id: 'test5' })

  store.setFilter({
    ...emptyFilter,
    withOpenEntry: true,
    withClosingEntry: true,
  })
  expect(store.filteredEvents.length).toEqual(1)
  expect(store.filteredEvents[0]).toMatchObject({ id: 'test5' })

  store.setFilter({
    ...emptyFilter,
    withUpcomingEntry: true,
  })
  expect(store.filteredEvents.length).toEqual(1)
  expect(store.filteredEvents[0]).toMatchObject({ id: 'test4' })

  store.setFilter({
    ...emptyFilter,
    withOpenEntry: true,
    withFreePlaces: true,
  })
  expect(store.filteredEvents.length).toEqual(1)
  expect(store.filteredEvents[0]).toMatchObject({ id: 'test5' })

  store.setFilter({
    ...emptyFilter,
    withOpenEntry: true,
    withUpcomingEntry: true,
  })
  expect(store.filteredEvents.length).toEqual(3)
  expect(store.filteredEvents[0]).toMatchObject({ id: 'test3' })
  expect(store.filteredEvents[1]).toMatchObject({ id: 'test4' })
  expect(store.filteredEvents[2]).toMatchObject({ id: 'test5' })

})
