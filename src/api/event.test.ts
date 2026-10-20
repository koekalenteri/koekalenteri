import type { DogEvent } from '../types'
import { parseISO } from 'date-fns'
import { emptyEvent } from '../__mockData__/emptyEvent'
import { isEntryClosing, isEntryOpen, isEntryUpcoming } from '../lib/event'
import { API_BASE_URL } from '../routeConfig'
import fetchMock from '../test-utils/fetchMock'
import { endOfFinnishDay, startOfFinnishDay } from '../test-utils/finnishDays'
import { describeInTimeZone } from '../test-utils/timeZone'
import {
  copyEventWithRegistrations,
  getAdminEvent,
  getAdminEvents,
  getEvent,
  getEventAuditTrail,
  getEvents,
  putEvent,
  putInvitationAttachment,
  putResultsPublished,
  putStartNumbers,
  searchEventKcIdChoices,
} from './event'

fetchMock.enableMocks()

beforeEach(() => {
  fetchMock.resetMocks()
  fetchMock.enableMocks()
})

test('getEvents', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET'
      ? Promise.resolve(JSON.stringify([emptyEvent]))
      : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const events = await getEvents()

  // A full list's cursor is the latest stamp among its events, as the server would compute it (KOE-1501)
  expect(events).toEqual({ cursor: emptyEvent.modifiedAt.getTime(), events: [emptyEvent], unchangedIds: [] })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/event/`, expect.any(Object))
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

  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/event/?start=${start.getTime()}&end=${end.getTime()}`,
    expect.any(Object)
  )
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
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/event/?since=123`, expect.any(Object))
  })

  test('supports legacy array response by normalizing it to delta response', async () => {
    fetchMock.mockResponse((req) =>
      req.method === 'GET'
        ? Promise.resolve(JSON.stringify([emptyEvent]))
        : Promise.reject(new Error(`${req.method} !== 'GET'`))
    )

    const since = 123
    const events = await getEvents(undefined, undefined, since)

    expect(events).toEqual({ cursor: emptyEvent.modifiedAt.getTime(), events: [emptyEvent], unchangedIds: [] })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/event/?since=123`, expect.any(Object))
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
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/event/TestEventID`, expect.any(Object))
})

test('getEventAuditTrail', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'GET' ? Promise.resolve(JSON.stringify([])) : Promise.reject(new Error(`${req.method} !== 'GET'`))
  )

  const auditTrail = await getEventAuditTrail('TestEventID', 'token')

  expect(auditTrail).toEqual([])
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/event/audit/TestEventID`, expect.any(Object))
})

test('getEventAuditTrail makes the stamp a Date and leaves a day parameter and a change text as written (KOE-1546)', async () => {
  fetchMock.mockResponseOnce(
    JSON.stringify([
      {
        auditKey: 'event:TestEventID',
        changes: [{ field: 'startDate', next: { text: '2026-05-01T21:00:00.000Z' }, previous: { state: 'empty' } }],
        messageKey: 'audit.messages.groupChanged',
        messageParams: { toDate: '2026-11-07', toNumber: 1 },
        timestamp: '2026-05-01T08:00:00.000Z',
        user: 'u',
      },
    ])
  )

  const auditTrail = await getEventAuditTrail('TestEventID', 'token')

  expect(auditTrail).toEqual([
    {
      auditKey: 'event:TestEventID',
      changes: [{ field: 'startDate', next: { text: '2026-05-01T21:00:00.000Z' }, previous: { state: 'empty' } }],
      messageKey: 'audit.messages.groupChanged',
      messageParams: { toDate: '2026-11-07', toNumber: 1 },
      timestamp: new Date('2026-05-01T08:00:00.000Z'),
      user: 'u',
    },
  ])
})

test('getAdminEvent reads the published-days lists as the day keys they are (KOE-1546)', async () => {
  fetchMock.mockResponseOnce(
    JSON.stringify({
      ...emptyEvent,
      resultsPublished: { ALO: ['2026-05-01'] },
      startNumbersPublished: ['2026-05-01/ap'],
    })
  )

  const event = await getAdminEvent('TestEventID', 'token')

  expect(event).toMatchObject({
    createdAt: emptyEvent.createdAt,
    resultsPublished: { ALO: ['2026-05-01'] },
    startNumbersPublished: ['2026-05-01/ap'],
  })
})

// KOE-1547: the event a secretary opens and saves goes back with its days as keys, the day the migration
// writes for each, also for a row not yet migrated that holds them an hour off.
for (const zone of ['Europe/Helsinki', 'America/New_York']) {
  describeInTimeZone(zone, () => {
    test('putEvent sends back the days of an event it read as day keys', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({
          ...emptyEvent,
          classes: [{ class: 'ALO', date: '2026-11-06T21:00:00.000Z' }],
          dates: [{ date: '2026-11-07', time: 'ap' }],
          endDate: '2026-11-08',
          entryEndDate: '2026-09-27T21:59:59.999Z',
          entryStartDate: '2026-09-01',
          id: 'TestEventID',
          startDate: '2026-11-06T21:00:00.000Z',
        })
      )
      const event = await getAdminEvent('TestEventID', 'token')
      fetchMock.mockResponseOnce(JSON.stringify({ ...emptyEvent, id: 'TestEventID' }))

      await putEvent(event, 'token')

      const sent = (text: string) =>
        expect(fetchMock).toHaveBeenLastCalledWith(
          `${API_BASE_URL}/admin/event/`,
          expect.objectContaining({ body: expect.stringContaining(text) })
        )
      sent('"classes":[{"class":"ALO","date":"2026-11-07"}]')
      sent('"dates":[{"date":"2026-11-07","time":"ap"}]')
      sent('"endDate":"2026-11-08"')
      sent('"entryEndDate":"2026-09-27"')
      sent('"entryStartDate":"2026-09-01"')
      sent('"startDate":"2026-11-07"')
    })
  })
}

test('getAdminEvents sends the incremental cursor', async () => {
  fetchMock.mockResponseOnce(JSON.stringify([]))

  await getAdminEvents('token', 123)

  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/event/?since=123`, expect.any(Object))
})

test('putEvent creates with POST', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'POST'
      ? Promise.resolve(JSON.stringify(emptyEvent))
      : Promise.reject(new Error(`${req.method} !== 'POST'`))
  )

  const newEvent = await putEvent({ eventType: 'TestEventType' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/event/`, expect.any(Object))
  expect(newEvent.id).not.toBeUndefined()
})

test('putEvent updates with PATCH', async () => {
  fetchMock.mockResponse((req) =>
    req.method === 'PATCH'
      ? Promise.resolve(JSON.stringify(emptyEvent))
      : Promise.reject(new Error(`${req.method} !== 'PATCH'`))
  )

  const updatedEvent = await putEvent({ eventType: 'TestEventType', id: 'TestEventID' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/event/`, expect.any(Object))
  expect(updatedEvent.id).not.toBeUndefined()
})

// East of Finland, so Kennelliitto's zone-less stamps read as local time would name the day before.
describeInTimeZone('Asia/Tokyo', () => {
  test('searchEventKcIdChoices', async () => {
    fetchMock.mockResponse((req) =>
      req.method === 'POST'
        ? Promise.resolve(
            JSON.stringify({
              choices: [
                { endDate: '2026-07-02', kcGuid: 'guid-123', startDate: '2026-07-01' },
                {
                  contactInfo: { secretary: { email: 'nome.maija@gmail.com', name: 'Parviainen Niina' } },
                  cost: 55,
                  description: 'Osallistumismaksu sisältää keittolounaan.',
                  endDate: '0001-01-01T00:00:00',
                  entryEndDate: '2026-06-07T00:00:00',
                  entryStartDate: '2026-05-17T00:00:00',
                  kcGuid: null,
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
    expect(fetchMock.mock.calls).toHaveLength(1)
    expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/admin/event/kcId/choices`)
    // The days go as the keys the model holds (KOE-1547).
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toEqual(request)
    expect(response.choices[0]?.kcGuid).toEqual('guid-123')
    expect(response.choices[1]?.kcGuid).toBeNull()
    expect(response.choices[0]?.startDate).toBe('2026-07-01')
    expect(response.choices[0]?.endDate).toBe('2026-07-02')
    expect(response.choices[1]?.startDate).toBe('2026-06-28')
    expect(response.choices[1]?.endDate).toBe('2026-06-28')
    expect(response.choices[1]?.entryStartDate).toBe('2026-05-17')
    expect(response.choices[1]?.entryEndDate).toBe('2026-06-07')
    expect(response.choices[1]).toEqual(
      expect.objectContaining({
        contactInfo: { secretary: { email: 'nome.maija@gmail.com', name: 'Parviainen Niina' } },
        cost: 55,
        description: 'Osallistumismaksu sisältää keittolounaan.',
      })
    )
  })
})

test('putResultsPublished names one day of one class (KOE-1510)', async () => {
  fetchMock.mockResponseOnce((req) =>
    req.method === 'PUT'
      ? Promise.resolve(JSON.stringify({ event: { ...emptyEvent, resultsPublished: { ALO: ['2026-09-12'] } } }))
      : Promise.reject(new Error(`${req.method} !== 'PUT'`))
  )

  const { event: saved } = await putResultsPublished(
    'TestEventID',
    { date: '2026-09-12', eventClass: 'ALO', published: true },
    'token'
  )

  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/admin/results-published/TestEventID`,
    expect.objectContaining({
      body: JSON.stringify({ date: '2026-09-12', eventClass: 'ALO', published: true }),
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      method: 'PUT',
    })
  )
  expect(saved.resultsPublished).toEqual({ ALO: ['2026-09-12'] })
})

/**
 * The entry days are day keys (KOE-1547); the clock is set to moments of Finnish days with
 * startOfFinnishDay / endOfFinnishDay, since new Date() of a bare day is midnight in UTC.
 */

const event: DogEvent = {
  ...emptyEvent,
  entryEndDate: '2021-01-13',
  entryStartDate: '2021-01-02',
}

test.each([
  { closing: false, date: '2021-01-01T23:59+02:00', open: false, upcoming: true },
  { closing: false, date: '2021-01-02T00:00+02:00', open: true, upcoming: false },
  { closing: false, date: '2021-01-05T00:00+02:00', open: true, upcoming: false },
  { closing: true, date: '2021-01-06T00:00+02:00', open: true, upcoming: false },
  { closing: true, date: '2021-01-13T00:00+02:00', open: true, upcoming: false },
  { closing: true, date: '2021-01-13T23:59+02:00', open: true, upcoming: false },
  { closing: false, date: '2021-01-14T00:00+02:00', open: false, upcoming: false },
])(
  `When entry is 2021-01-02 to 2021-01-13, @$date: isEntryOpen: $open, isEntryClosing: $closing, isEntryUpcoming: $upcoming`,
  ({ date, open, closing, upcoming }) => {
    expect(isEntryOpen(event, parseISO(date))).toEqual(open)
    expect(isEntryClosing(event, parseISO(date))).toEqual(closing)
    expect(isEntryUpcoming(event, parseISO(date))).toEqual(upcoming)
  }
)

test('putStartNumbers answers with the event as saved, its dates Dates and its day keys strings', async () => {
  fetchMock.mockResponseOnce(
    JSON.stringify({ event: { ...emptyEvent, startNumbersPublished: { ALO: ['2026-09-12', '2026-09-13/ap'] } } })
  )

  const { event: saved } = await putStartNumbers(
    'TestEventID',
    { date: '2026-09-12', eventClass: 'ALO', published: true },
    'token'
  )

  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/admin/startnumbers/TestEventID`,
    expect.objectContaining({
      body: JSON.stringify({ date: '2026-09-12', eventClass: 'ALO', published: true }),
      method: 'PUT',
    })
  )
  expect(saved.startDate).toEqual(emptyEvent.startDate)
  expect(saved.startNumbersPublished).toEqual({ ALO: ['2026-09-12', '2026-09-13/ap'] })
})

test('putInvitationAttachment answers with the upload time and the history as Dates', async () => {
  // The upload goes as FormData, which the fetch mock's Request cannot take from jsdom; answer the fetch itself.
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        invitationAttachmentHistory: { 'key-1': { className: 'ALO', uploadedAt: '2026-08-01T08:00:00.000Z' } },
        key: 'key-1',
        uploadedAt: '2026-08-01T08:00:00.000Z',
      })
    )
  )

  const response = await putInvitationAttachment('TestEventID', new File(['pdf'], 'kutsu.pdf'), 'ALO', 'token')

  expect(fetchSpy).toHaveBeenCalledWith(
    `${API_BASE_URL}/admin/file/invitation/TestEventID/ALO`,
    expect.objectContaining({ method: 'POST' })
  )
  expect(response).toEqual({
    invitationAttachmentHistory: { 'key-1': { className: 'ALO', uploadedAt: new Date('2026-08-01T08:00:00.000Z') } },
    key: 'key-1',
    uploadedAt: new Date('2026-08-01T08:00:00.000Z'),
  })
})

test('copyEventWithRegistrations answers with the copy, its dates Dates', async () => {
  fetchMock.mockResponseOnce(JSON.stringify({ ...emptyEvent, id: 'copy' }))

  const copy = await copyEventWithRegistrations('TestEventID', 'token')

  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/admin/event/copy`,
    expect.objectContaining({ method: 'POST' })
  )
  expect(copy).toEqual({ ...emptyEvent, id: 'copy' })
})

test('isEntryOpen with mocked date', () => {
  vi.useFakeTimers()

  vi.setSystemTime(endOfFinnishDay('2021-01-01'))
  expect(isEntryOpen(event)).toEqual(false)

  vi.setSystemTime(startOfFinnishDay('2021-01-02'))
  expect(isEntryOpen(event)).toEqual(true)

  vi.useRealTimers()
})
