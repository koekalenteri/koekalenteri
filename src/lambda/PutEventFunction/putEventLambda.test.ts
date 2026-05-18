import type { JsonConfirmedEvent, JsonUser } from '../../types'
import { jest } from '@jest/globals'
import { constructAPIGwEvent } from '../test-utils/helpers'

jest.useFakeTimers()
jest.setSystemTime(new Date('2025-03-22T12:45:33+0200'))

const mockAuthorize = jest.fn<() => Promise<JsonUser | null>>()
const mockSaveEvent = jest.fn<() => Promise<unknown>>()

jest.unstable_mockModule('../auth/api', () => ({
  authorize: mockAuthorize,
}))

jest.unstable_mockModule('../event/actions', () => ({
  saveEvent: mockSaveEvent,
}))

const { default: putEventLambda } = await import('./handler')

const mockSecretary: JsonUser = {
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: '',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
  roles: {
    'org-id': 'secretary',
  },
}

const mockEvent: JsonConfirmedEvent = {
  classes: [],
  cost: 0,
  costMember: 0,
  createdAt: '2024-12-12T21:42:42.000Z',
  createdBy: 'system',
  description: '',
  endDate: '2025-03-25T00:00:00Z',
  entries: 10,
  entryEndDate: '2025-03-20T00:00:00Z',
  entryStartDate: '2025-03-01T00:00:00Z',
  eventType: 'TEST',
  id: 'existing',
  judges: [],
  location: '',
  modifiedAt: '',
  modifiedBy: '',
  name: '',
  official: {},
  organizer: {
    id: 'org-id',
    name: 'org name',
  },
  places: 0,
  secretary: {},
  startDate: '2025-04-01T00:00:00Z',
  state: 'confirmed',
}

describe('putEventLambda', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 if authorization fails', async () => {
    mockAuthorize.mockResolvedValueOnce(null)

    const res = await putEventLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(401)
    expect(mockSaveEvent).not.toHaveBeenCalled()
  })

  it('returns 403 when save action rejects with Forbidden', async () => {
    mockAuthorize.mockResolvedValueOnce(mockSecretary)
    mockSaveEvent.mockRejectedValueOnce(new Error('Forbidden'))

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonConfirmedEvent>>({ id: 'existing' }))

    expect(res.statusCode).toEqual(403)
  })

  it('delegates create flow to save action and returns the saved payload', async () => {
    const saved = {
      ...mockEvent,
      eventType: 'TEST',
      id: 'new-id',
      modifiedAt: '2025-03-22T10:45:33.000Z',
      modifiedBy: 'Test User',
    }

    mockAuthorize.mockResolvedValueOnce(mockSecretary)
    mockSaveEvent.mockResolvedValueOnce({
      aggregateSyncTriggered: false,
      created: true,
      event: saved,
    })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonConfirmedEvent>>({ eventType: 'TEST' }))

    expect(mockSaveEvent).toHaveBeenCalledWith({
      item: { eventType: 'TEST' },
      timestamp: '2025-03-22T10:45:33.000Z',
      user: mockSecretary,
    })
    expect(res.statusCode).toEqual(200)
    expect(res.body).toContain('new-id')
  })

  it('returns 200 with the updated event on a successful patch', async () => {
    const updated = { ...mockEvent, name: 'Updated Name' }

    mockAuthorize.mockResolvedValueOnce(mockSecretary)
    mockSaveEvent.mockResolvedValueOnce({
      aggregateSyncTriggered: false,
      created: false,
      event: updated,
    })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonConfirmedEvent>>({ id: 'existing', name: 'Updated Name' })
    )

    expect(res.statusCode).toEqual(200)
    expect(res.body).toContain('Updated Name')
  })

  it('returns 200 and reports aggregateSyncTriggered when aggregate fields changed', async () => {
    mockAuthorize.mockResolvedValueOnce(mockSecretary)
    mockSaveEvent.mockResolvedValueOnce({
      aggregateSyncTriggered: true,
      created: false,
      event: { ...mockEvent, entries: 11 },
    })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonConfirmedEvent>>({ entries: 11, id: 'existing' }))

    expect(res.statusCode).toEqual(200)
    expect(res.body).toContain('existing')
  })
})
