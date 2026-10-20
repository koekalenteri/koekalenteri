import { API_BASE_URL } from '../routeConfig'
import fetchMock from '../test-utils/fetchMock'
import { getStationEntry, getStationLink, putStationEntry, putStationEntryTurn, putStationTurn } from './station'

fetchMock.enableMocks()

beforeEach(() => {
  fetchMock.resetMocks()
  fetchMock.enableMocks()
})

/** A turn as the server writes it: every stamp an ISO string. */
const wireTurn = {
  dogs: [{ name: 'Hukka', number: 1 }],
  endedAt: '2026-09-12T08:06:00.000Z',
  id: 'turn-1',
  phases: [{ key: 'search', startedAt: '2026-09-12T08:01:00.000Z' }],
  startedAt: '2026-09-12T08:00:00.000Z',
  stationId: '1',
}

const modelTurn = {
  ...wireTurn,
  endedAt: new Date('2026-09-12T08:06:00.000Z'),
  phases: [{ key: 'search', startedAt: new Date('2026-09-12T08:01:00.000Z') }],
  startedAt: new Date('2026-09-12T08:00:00.000Z'),
}

const wireResult = {
  tasks: [{ index: 0, points: 10, stationId: '1', updatedAt: '2026-09-12T08:05:00.000Z', updatedBy: 'u' }],
  updatedAt: '2026-09-12T08:05:00.000Z',
  updatedBy: 'u',
}

const modelResult = {
  tasks: [{ index: 0, points: 10, stationId: '1', updatedAt: new Date('2026-09-12T08:05:00.000Z'), updatedBy: 'u' }],
  updatedAt: new Date('2026-09-12T08:05:00.000Z'),
  updatedBy: 'u',
}

test('getStationEntry reads the days of the trial, the post and the dogs as keys, and the moments of the turns as Dates (KOE-1547)', async () => {
  fetchMock.mockResponseOnce(
    JSON.stringify({
      event: {
        classes: [{ class: 'ALO', date: '2026-09-11T21:00:00.000Z' }],
        endDate: '2026-09-11T21:00:00.000Z',
        eventType: 'NOWT',
        id: 'e1',
        location: 'Tampere',
        name: '2026-09-12',
        startDate: '2026-09-11T21:00:00.000Z',
      },
      registrations: [
        {
          class: 'ALO',
          dog: { name: 'Hukka' },
          eventResult: wireResult,
          eventType: 'NOWT',
          group: { date: '2026-09-11T21:00:00.000Z', key: '2026-09-12', number: 1, time: 'ap' },
          id: 'r1',
        },
      ],
      station: { date: '2026-09-11T21:00:00.000Z', id: '1', number: 1, tasks: 2 },
      turns: [wireTurn],
    })
  )

  const entry = await getStationEntry('e1', '1', 'station-token')

  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/station-entry/e1/1`,
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer station-token' }) })
  )
  expect(entry.event.startDate).toEqual('2026-09-12')
  expect(entry.event.classes[0].date).toEqual('2026-09-12')
  // The name the secretary typed looks like a day and stays text.
  expect(entry.event.name).toBe('2026-09-12')
  expect(entry.station.date).toEqual('2026-09-12')
  expect(entry.registrations[0].group?.date).toEqual('2026-09-12')
  // The group's key is a day key and stays one.
  expect(entry.registrations[0].group?.key).toBe('2026-09-12')
  expect(entry.registrations[0].eventResult).toEqual(modelResult)
  expect(entry.turns).toEqual([modelTurn])
})

test('putStationEntry answers with the results as stored, their stamps Dates', async () => {
  fetchMock.mockResponseOnce(
    JSON.stringify({
      conflicts: [{ id: 'r2', stationId: '1', stored: wireResult, submitted: wireResult }],
      saved: [{ eventResult: wireResult, id: 'r1' }],
      unchanged: [],
    })
  )

  const response = await putStationEntry('e1', '1', [], 'station-token')

  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/station-entry/e1/1`,
    expect.objectContaining({ method: 'POST' })
  )
  expect(response).toEqual({
    conflicts: [{ id: 'r2', stationId: '1', stored: modelResult, submitted: modelResult }],
    saved: [{ eventResult: modelResult, id: 'r1' }],
    unchanged: [],
  })
})

test('putStationTurn answers with the timeline, every stamp a Date', async () => {
  fetchMock.mockResponseOnce(JSON.stringify({ turns: [{ ...wireTurn, registrationIds: ['r1'] }] }))

  const { turns } = await putStationTurn('e1', { stationId: '1', type: 'end' }, 'token')

  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/turns/e1`, expect.objectContaining({ method: 'PUT' }))
  expect(turns).toEqual([{ ...modelTurn, registrationIds: ['r1'] }])
})

test('putStationEntryTurn answers with the public timeline, every stamp a Date', async () => {
  fetchMock.mockResponseOnce(JSON.stringify({ turns: [wireTurn] }))

  const { turns } = await putStationEntryTurn('e1', '1', { type: 'end' }, 'station-token')

  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/station-entry/e1/1/turn`,
    expect.objectContaining({ method: 'POST' })
  )
  expect(turns).toEqual([modelTurn])
})

test('getStationLink', async () => {
  fetchMock.mockResponseOnce(JSON.stringify({ token: 'station-token' }))

  await expect(getStationLink('e1', '1', 'token')).resolves.toEqual({ token: 'station-token' })
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/station-link/e1/1`, expect.any(Object))
})
