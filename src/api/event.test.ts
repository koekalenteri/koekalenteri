import type { DogEvent } from '../types'

import { parseISO } from 'date-fns'
import fetchMock from 'jest-fetch-mock'

import { emptyEvent } from '../__mockData__/emptyEvent'
import { zonedEndOfDay, zonedStartOfDay } from '../i18n/dates'
import { isEntryClosing, isEntryOpen, isEntryUpcoming } from '../lib/utils'
import { API_BASE_URL } from '../routeConfig'

import { getEvent, getEvents, putEvent } from './event'

fetchMock.enableMocks()

beforeEach(() => fetchMock.resetMocks())

test('getEvents', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET'
      ? Promise.resolve(JSON.stringify([emptyEvent]))
      : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const events = await getEvents()

  expect(events.length).toEqual(1)
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/event/')
})

test('getEvents with since', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET'
      ? Promise.resolve(JSON.stringify([emptyEvent]))
      : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const since = 123
  const events = await getEvents(undefined, undefined, since)

  expect(events.length).toEqual(1)
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/event/?since=123')
})

test('getEvent', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET'
      ? Promise.resolve(JSON.stringify(emptyEvent))
      : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const testEvent = await getEvent('TestEventID')

  expect(testEvent).toMatchObject(emptyEvent)
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/event/TestEventID')
})

test('putEvent', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'POST'
      ? Promise.resolve(JSON.stringify(emptyEvent))
      : Promise.reject(new Error(`${req.method} !== 'POST'`))
  )

  const newEvent = await putEvent({ eventType: 'TestEventType' })
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(API_BASE_URL + '/admin/event/')
  expect(newEvent.id).not.toBeUndefined()
})

/**
 * Using zonedStartOfDay / zonedEndOfDay here, because new Date() for a date without time defaults to midnight in GMT.
 * new Date() could also be inconsistent between browsers.
 * We want midnight in Europe/Helsinki timezone.
 */

const event: DogEvent = {
  ...emptyEvent,
  entryStartDate: zonedStartOfDay('2021-01-02'),
  entryEndDate: zonedEndOfDay('2021-01-13'),
}

test.each([
  { date: '2021-01-01T23:59+02:00', open: false, closing: false, upcoming: true },
  { date: '2021-01-02T00:00+02:00', open: true, closing: false, upcoming: false },
  { date: '2021-01-05T00:00+02:00', open: true, closing: false, upcoming: false },
  { date: '2021-01-06T00:00+02:00', open: true, closing: true, upcoming: false },
  { date: '2021-01-13T00:00+02:00', open: true, closing: true, upcoming: false },
  { date: '2021-01-13T23:59+02:00', open: true, closing: true, upcoming: false },
  { date: '2021-01-14T00:00+02:00', open: false, closing: false, upcoming: false },
])(
  `When entry is 2021-01-02 to 2021-01-13, @$date: isEntryOpen: $open, isEntryClosing: $closing, isEntryUpcoming: $upcoming`,
  ({ date, open, closing, upcoming }) => {
    expect(isEntryOpen(event, parseISO(date))).toEqual(open)
    expect(isEntryClosing(event, parseISO(date))).toEqual(closing)
    expect(isEntryUpcoming(event, parseISO(date))).toEqual(upcoming)
  }
)

test('isEntryOpen with mocked date', function () {
  jest.useFakeTimers()

  jest.setSystemTime(zonedEndOfDay('2021-01-01'))
  expect(isEntryOpen(event)).toEqual(false)

  jest.setSystemTime(zonedStartOfDay('2021-01-02'))
  expect(isEntryOpen(event)).toEqual(true)

  jest.useRealTimers()
})
