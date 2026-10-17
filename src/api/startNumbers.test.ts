import { API_BASE_URL } from '../routeConfig'
import fetchMock from '../test-utils/fetchMock'
import { getClassStartNumbers, getStartNumberLink, putClassStartNumbers } from './startNumbers'

fetchMock.enableMocks()

beforeEach(() => {
  fetchMock.resetMocks()
  fetchMock.enableMocks()
})

test('getClassStartNumbers makes the days of the trial and the placements Dates (KOE-1546)', async () => {
  fetchMock.mockResponseOnce(
    JSON.stringify({
      event: {
        classes: [{ class: 'ALO', date: '2026-09-11T21:00:00.000Z' }],
        endDate: '2026-09-11T21:00:00.000Z',
        eventType: 'NOME-B',
        id: 'e1',
        location: 'Tampere',
        name: 'Syyskoe',
        startDate: '2026-09-11T21:00:00.000Z',
      },
      eventClass: 'ALO',
      registrations: [
        {
          class: 'ALO',
          dog: { name: 'Hukka', regNo: 'FI1/20' },
          eventType: 'NOME-B',
          group: { date: '2026-09-11T21:00:00.000Z', key: '2026-09-12-ap', number: 3, time: 'ap' },
          id: 'r1',
          startGroup: { date: '2026-09-11T21:00:00.000Z', key: '2026-09-12-ap', number: 1, time: 'ap' },
        },
      ],
      reserved: [{ eventClass: 'AVO', number: 2 }],
    })
  )

  const sheet = await getClassStartNumbers('e1', 'ALO', 'class-token')

  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/start-numbers/e1/ALO`,
    expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer class-token' }) })
  )
  expect(sheet.event.startDate).toEqual(new Date('2026-09-11T21:00:00.000Z'))
  expect(sheet.event.classes[0].date).toEqual(new Date('2026-09-11T21:00:00.000Z'))
  expect(sheet.registrations[0].group?.date).toEqual(new Date('2026-09-11T21:00:00.000Z'))
  expect(sheet.registrations[0].startGroup?.date).toEqual(new Date('2026-09-11T21:00:00.000Z'))
  expect(sheet.registrations[0].startGroup?.key).toBe('2026-09-12-ap')
  expect(sheet.reserved).toEqual([{ eventClass: 'AVO', number: 2 }])
})

test('putClassStartNumbers answers with the frozen placements as Dates, and a yielded one as null', async () => {
  fetchMock.mockResponseOnce(
    JSON.stringify({
      patches: [
        { id: 'r1', startGroup: { date: '2026-09-11T21:00:00.000Z', key: '2026-09-12-ap', number: 1, time: 'ap' } },
        { id: 'r2', startGroup: null },
      ],
    })
  )

  const { patches } = await putClassStartNumbers('e1', 'ALO', [{ id: 'r1', startNumber: 1 }], 'class-token')

  expect(fetchMock).toHaveBeenCalledWith(
    `${API_BASE_URL}/start-numbers/e1/ALO`,
    expect.objectContaining({ body: JSON.stringify({ numbers: [{ id: 'r1', startNumber: 1 }] }), method: 'POST' })
  )
  expect(patches).toEqual([
    {
      id: 'r1',
      startGroup: { date: new Date('2026-09-11T21:00:00.000Z'), key: '2026-09-12-ap', number: 1, time: 'ap' },
    },
    { id: 'r2', startGroup: null },
  ])
})

test('getStartNumberLink', async () => {
  fetchMock.mockResponseOnce(JSON.stringify({ token: 'class-token' }))

  await expect(getStartNumberLink('e1', 'ALO', 'token')).resolves.toEqual({ token: 'class-token' })
  expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/admin/start-numbers-link/e1/ALO`, expect.any(Object))
})
