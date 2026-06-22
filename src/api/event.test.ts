import type { DogEvent } from '../types'
import { parseISO } from 'date-fns'
import fetchMock from 'jest-fetch-mock'
import { emptyEvent } from '../__mockData__/emptyEvent'
import { zonedDateString, zonedEndOfDay, zonedStartOfDay } from '../i18n/dates'
import { isEntryClosing, isEntryOpen, isEntryUpcoming } from '../lib/utils'
import { API_BASE_URL } from '../routeConfig'
import { getEvent, getEventAuditTrail, getEvents, putEvent, searchEventKcIdChoices } from './event'

fetchMock.enableMocks()

beforeEach(() => fetchMock.resetMocks())

test('getEvents', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET'
      ? Promise.resolve(JSON.stringify([emptyEvent]))
      : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const events = await getEvents()

  expect(events).toEqual({ events: [emptyEvent], unchangedIds: [] })
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/event/`)
})

test('getEvents with start and end uses timestamps in query params', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET'
      ? Promise.resolve(JSON.stringify([emptyEvent]))
      : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const start = new Date('2026-01-02T00:00:00.000Z')
  const end = new Date('2026-01-05T00:00:00.000Z')

  await getEvents(start, end)

  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/event/?start=${start.getTime()}&end=${end.getTime()}`)
})

describe('getEvents with since', () => {
  test('supports current delta response', async () => {
    fetchMock.mockResponse((req) =>
      req.method === 'GET'
        ? Promise.resolve(JSON.stringify({ events: [emptyEvent], unchangedIds: ['event-1'] }))
        : Promise.reject(new Error(`${req.method} !== 'GET'`))
    )

    const since = 123
    const events = await getEvents(undefined, undefined, since)

    expect(events).toEqual({ events: [emptyEvent], unchangedIds: ['event-1'] })
    expect(fetchMock.mock.calls.length).toEqual(1)
    expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/event/?since=123`)
  })

  test('supports legacy array response by normalizing it to delta response', async () => {
    fetchMock.mockResponse((req) =>
      req.method === 'GET'
        ? Promise.resolve(JSON.stringify([emptyEvent]))
        : Promise.reject(new Error(`${req.method} !== 'GET'`))
    )

    const since = 123
    const events = await getEvents(undefined, undefined, since)

    expect(events).toEqual({ events: [emptyEvent], unchangedIds: [] })
    expect(fetchMock.mock.calls.length).toEqual(1)
    expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/event/?since=123`)
  })
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
  expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/event/TestEventID`)
})

test('getEventAuditTrail', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET' ? Promise.resolve(JSON.stringify([])) : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const auditTrail = await getEventAuditTrail('TestEventID', 'token')

  expect(auditTrail).toEqual([])
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/admin/event/audit/TestEventID`)
})

test('putEvent creates with POST', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'POST'
      ? Promise.resolve(JSON.stringify(emptyEvent))
      : Promise.reject(new Error(`${req.method} !== 'POST'`))
  )

  const newEvent = await putEvent({ eventType: 'TestEventType' })
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/admin/event/`)
  expect(newEvent.id).not.toBeUndefined()
})

test('putEvent updates with PATCH', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'PATCH'
      ? Promise.resolve(JSON.stringify(emptyEvent))
      : Promise.reject(new Error(`${req.method} !== 'PATCH'`))
  )

  const updatedEvent = await putEvent({ eventType: 'TestEventType', id: 'TestEventID' })
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/admin/event/`)
  expect(updatedEvent.id).not.toBeUndefined()
})

test('searchEventKcIdChoices', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'POST'
      ? Promise.resolve(
          JSON.stringify({
            choices: [
              { endDate: '2026-07-02', id: 123, startDate: '2026-07-01' },
              {
                contactInfo: { secretary: { email: 'nome.maija@gmail.com', name: 'Parviainen Niina' } },
                cost: 55,
                description: 'Osallistumismaksu sisältää keittolounaan.',
                endDate: '0001-01-01T00:00:00',
                entryEndDate: '2026-06-07T00:00:00',
                entryStartDate: '2026-05-17T00:00:00',
                id: 456,
                startDate: '2026-06-28T00:00:00',
              },
            ],
          })
        )
      : Promise.reject(new Error(`${req.method} !== 'POST'`))
  )

  const request = {
    classes: emptyEvent.classes,
    endDate: emptyEvent.endDate,
    eventType: emptyEvent.eventType,
    location: emptyEvent.location,
    name: emptyEvent.name,
    organizer: { id: emptyEvent.organizer.id },
    startDate: emptyEvent.startDate,
  }
  const response = await searchEventKcIdChoices(request)
  expect(fetchMock.mock.calls.length).toEqual(1)
  expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/admin/event/kcId/choices`)
  expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual({
    ...request,
    classes: request.classes.map((c) => ({ ...c, date: c.date.toISOString() })),
    endDate: emptyEvent.endDate.toISOString(),
    startDate: emptyEvent.startDate.toISOString(),
  })
  expect(response.choices[0]?.id).toEqual(123)
  expect(response.choices[0]?.startDate).toBeInstanceOf(Date)
  expect(response.choices[0]?.endDate).toBeInstanceOf(Date)
  expect(zonedDateString(response.choices[0]!.startDate)).toEqual('2026-07-01')
  expect(zonedDateString(response.choices[0]!.endDate)).toEqual('2026-07-02')
  expect(zonedDateString(response.choices[1]!.startDate)).toEqual('2026-06-28')
  expect(zonedDateString(response.choices[1]!.endDate)).toEqual('2026-06-28')
  expect(zonedDateString(response.choices[1]!.entryStartDate!)).toEqual('2026-05-17')
  expect(zonedDateString(response.choices[1]!.entryEndDate!)).toEqual('2026-06-07')
  expect(response.choices[1]).toEqual(
    expect.objectContaining({
      contactInfo: { secretary: { email: 'nome.maija@gmail.com', name: 'Parviainen Niina' } },
      cost: 55,
      description: 'Osallistumismaksu sisältää keittolounaan.',
    })
  )
})

/**
 * Using zonedStartOfDay / zonedEndOfDay here, because new Date() for a date without time defaults to midnight in GMT.
 * new Date() could also be inconsistent between browsers.
 * We want midnight in Europe/Helsinki timezone.
 */

const event: DogEvent = {
  ...emptyEvent,
  entryEndDate: zonedEndOfDay('2021-01-13'),
  entryStartDate: zonedStartOfDay('2021-01-02'),
}

test.each([
  { closing: false, date: '2021-01-01T23:59+02:00', open: false, upcoming: true },
  { closing: false, date: '2021-01-02T00:00+02:00', open: true, upcoming: false },
  { closing: false, date: '2021-01-05T00:00+02:00', open: true, upcoming: false },
  { closing: true, date: '2021-01-06T00:00+02:00', open: true, upcoming: false },
  { closing: true, date: '2021-01-13T00:00+02:00', open: true, upcoming: false },
  { closing: true, date: '2021-01-13T23:59+02:00', open: true, upcoming: false },
  { closing: false, date: '2021-01-14T00:00+02:00', open: false, upcoming: false },
])(`When entry is 2021-01-02 to 2021-01-13, @$date: isEntryOpen: $open, isEntryClosing: $closing, isEntryUpcoming: $upcoming`, ({
  date,
  open,
  closing,
  upcoming,
}) => {
  expect(isEntryOpen(event, parseISO(date))).toEqual(open)
  expect(isEntryClosing(event, parseISO(date))).toEqual(closing)
  expect(isEntryUpcoming(event, parseISO(date))).toEqual(upcoming)
})

test('isEntryOpen with mocked date', () => {
  jest.useFakeTimers()

  jest.setSystemTime(zonedEndOfDay('2021-01-01'))
  expect(isEntryOpen(event)).toEqual(false)

  jest.setSystemTime(zonedStartOfDay('2021-01-02'))
  expect(isEntryOpen(event)).toEqual(true)

  jest.useRealTimers()
})
