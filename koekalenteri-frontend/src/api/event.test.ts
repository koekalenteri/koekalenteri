import { parseISO } from "date-fns"
import fetchMock from 'jest-fetch-mock'
import type { Event } from 'koekalenteri-shared/model'

import { API_BASE_URL } from "../routeConfig"

import { emptyEvent } from './test-utils/emptyEvent'
import { getEvent, getEvents, putEvent } from './event'
import { rehydrateEvent } from './utils'

fetchMock.enableMocks()

beforeEach(() => fetchMock.resetMocks())

test('getEvents', async () => {
  fetchMock.mockResponse(req => req.method === 'GET'
    ? Promise.resolve(JSON.stringify([emptyEvent]))
    : Promise.reject(new Error(`${req.method} !== 'GET'`)))

  const events = await getEvents()

  expect(events.length).toEqual(1)
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/event/')
})

test('getEvent', async () => {
  fetchMock.mockResponse(req => req.method === 'GET'
    ? Promise.resolve(JSON.stringify(emptyEvent))
    : Promise.reject(new Error(`${req.method} !== 'GET'`)))

  const testEvent = await getEvent('TestEventID')

  expect(testEvent).toMatchObject(emptyEvent)
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/event/TestEventID')
})

test('putEvent', async() => {
  fetchMock.mockResponse(req => req.method === 'POST'
    ? Promise.resolve(JSON.stringify(emptyEvent))
    : Promise.reject(new Error(`${req.method} !== 'POST'`)))

  const newEvent = await putEvent({ eventType: 'TestEventType' })
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/event/')
  expect(newEvent.id).not.toBeUndefined()
})

/**
 * Using parseISO here, because new Date() for a date without time defaults to midnight in GMT.
 * new Date() could also be inconsistent between browsers.
 * We want midnight in current timezone.
 */

const event: Event = {
  ...emptyEvent,
  entryStartDate: parseISO('2021-01-02'),
  entryEndDate: parseISO('2021-01-13'),
}

test.each([
  { date: '2021-01-01 23:59', open: false, closing: false, upcoming: true },
  { date: '2021-01-02', open: true, closing: false, upcoming: false },
  { date: '2021-01-02 00:00', open: true, closing: false, upcoming: false },
  { date: '2021-01-05', open: true, closing: false, upcoming: false },
  { date: '2021-01-06', open: true, closing: true, upcoming: false },
  { date: '2021-01-13', open: true, closing: true, upcoming: false },
  { date: '2021-01-13 23:59', open: true, closing: true, upcoming: false },
  { date: '2021-01-14 00:00', open: false, closing: false, upcoming: false },
])(`When entry is 2021-01-02 to 2021-01-13, @$date: isEntryOpen: $open, isEntryClosing: $closing, isEntryUpcoming: $upcoming`, ({ date, open, closing, upcoming }) => {
  expect(rehydrateEvent(event, parseISO(date)).isEntryOpen).toEqual(open)
  expect(rehydrateEvent(event, parseISO(date)).isEntryClosing).toEqual(closing)
  expect(rehydrateEvent(event, parseISO(date)).isEntryUpcoming).toEqual(upcoming)
})

test('isEntryOpen with mocked date', function() {
  jest.useFakeTimers()

  jest.setSystemTime(parseISO('2021-01-01'))
  expect(rehydrateEvent(event).isEntryOpen).toEqual(false)

  jest.setSystemTime(parseISO('2021-01-02'))
  expect(rehydrateEvent(event).isEntryOpen).toEqual(true)

  jest.useRealTimers()
})
