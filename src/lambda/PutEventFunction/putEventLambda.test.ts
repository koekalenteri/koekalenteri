import type { JsonDogEvent, JsonUser } from '../../types'
import { jest } from '@jest/globals'
import { constructAPIGwEvent } from '../test-utils/helpers'

jest.useFakeTimers()
jest.setSystemTime(new Date('2025-03-22T12:45:33+0200'))

jest.unstable_mockModule('nanoid', () => ({ nanoid: () => 'new-id' }))

jest.unstable_mockModule('../lib/api-gw', () => ({
  getOrigin: jest.fn(),
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: jest.fn(),
}))

jest.unstable_mockModule('../lib/event', () => ({
  findQualificationStartDate: jest.fn(),
  getEvent: jest.fn(),
  saveEvent: jest.fn(),
  updateRegistrations: jest.fn(),
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => ({ write: jest.fn() })),
}))

const { authorize } = await import('../lib/auth')
const authorizeMock = authorize as jest.Mock<typeof authorize>

const { findQualificationStartDate, getEvent, saveEvent, updateRegistrations } = await import('../lib/event')
const findQualificationStartDateMock = findQualificationStartDate as jest.Mock<typeof findQualificationStartDate>
const getEventMock = getEvent as jest.Mock<typeof getEvent>
const saveEventMock = saveEvent as jest.Mock<typeof saveEvent>
const updateRegistrationsMock = updateRegistrations as jest.Mock<typeof updateRegistrations>

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

const mockAdmin: JsonUser = {
  admin: true,
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: '',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
}

const mockEvent: JsonDogEvent = {
  classes: [],
  cost: 0,
  costMember: 0,
  createdAt: '2024-12-12T21:42:42.000Z',
  createdBy: 'system',
  description: '',
  endDate: '',
  eventType: '',
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
  startDate: '',
  state: 'draft',
}

describe('putEventLambda', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)

  afterEach(() => jest.clearAllMocks())

  it('should return 401 if authorization fails', async () => {
    authorizeMock.mockResolvedValueOnce(null)

    const res = await putEventLambda(constructAPIGwEvent('test'))

    expect(res.statusCode).toEqual(401)
  })

  it('should return 403 if user does not have permissions to modify existing event', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, organizer: { id: 'no-access', name: 'some org' } })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing' }))

    expect(res.statusCode).toEqual(403)
  })

  it('should return 403 if user does not have to the updated org', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce(mockEvent)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ id: 'existing', organizer: { id: 'no-access', name: 'some org' } })
    )

    expect(res.statusCode).toEqual(403)

    authorizeMock.mockResolvedValueOnce(mockSecretary)
    const res2 = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ organizer: { id: 'no-access', name: 'some org' } })
    )

    expect(res2.statusCode).toEqual(403)
  })

  it('should return 403 when trying to delete non-deletable event', async () => {
    jest.spyOn(console, 'log').mockImplementationOnce(() => undefined)
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, state: 'invited' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ deletedAt: new Date().toISOString(), id: 'existing' })
    )

    expect(res.statusCode).toEqual(403)
  })

  it('should allow deleting a draft event', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, state: 'draft' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ deletedAt: new Date().toISOString(), id: 'existing' })
    )

    expect(res.statusCode).toEqual(200)
  })

  it('should allow admin to edit any organizers events', async () => {
    authorizeMock.mockResolvedValueOnce(mockAdmin)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, organizer: { id: 'no-access', name: 'some org' } })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing' }))

    expect(res.statusCode).toEqual(200)
  })

  it('should create a new event', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST' }))

    expect(getEventMock).not.toHaveBeenCalled()
    expect(updateRegistrationsMock).not.toHaveBeenCalled()
    expect(saveEventMock).toHaveBeenCalledWith({
      createdAt: '2025-03-22T10:45:33.000Z',
      createdBy: 'Test User',
      eventType: 'TEST',
      id: 'new-id',
      modifiedAt: '2025-03-22T10:45:33.000Z',
      modifiedBy: 'Test User',
    })
    expect(res.statusCode).toEqual(200)
  })

  it('should update an event', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce(mockEvent)

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ eventType: 'TEST', id: 'existing' }))

    expect(getEventMock).toHaveBeenCalledWith('existing')
    expect(updateRegistrationsMock).not.toHaveBeenCalled()
    expect(saveEventMock).toHaveBeenCalledWith({
      ...mockEvent,
      eventType: 'TEST',
      modifiedAt: '2025-03-22T10:45:33.000Z',
      modifiedBy: 'Test User',
    })
    expect(res.statusCode).toEqual(200)
  })

  it('should update registrations if entries differs', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, entries: 10 })

    const res = await putEventLambda(constructAPIGwEvent<Partial<JsonDogEvent>>({ entries: 11, id: 'existing' }))

    expect(updateRegistrationsMock).toHaveBeenCalledWith('existing')
    expect(saveEventMock).toHaveBeenCalledWith({
      ...mockEvent,
      entries: 11,
      modifiedAt: '2025-03-22T10:45:33.000Z',
      modifiedBy: 'Test User',
    })
    expect(res.statusCode).toEqual(200)
  })

  it('should store the original entryEndDate for a confirmed event', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({
      ...mockEvent,
      entryEndDate: '2025-03-25T00:00:00Z',
      entryStartDate: '2025-03-01T00:00:00Z',
      state: 'confirmed',
    })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ entryEndDate: '2025-04-01T00:00:00Z', id: 'existing' })
    )

    expect(saveEventMock).toHaveBeenCalledWith({
      ...mockEvent,
      entryEndDate: '2025-04-01T00:00:00Z',
      entryOrigEndDate: '2025-03-25T00:00:00Z',
      entryStartDate: '2025-03-01T00:00:00Z',
      modifiedAt: '2025-03-22T10:45:33.000Z',
      modifiedBy: 'Test User',
      state: 'confirmed',
    })
    expect(res.statusCode).toEqual(200)
  })

  it('should not store the original entryEndDate when moved backward', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, entryEndDate: '2025-02-02T00:00:00Z', state: 'confirmed' })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ entryEndDate: '2025-01-01T00:00:00Z', id: 'existing' })
    )

    expect(saveEventMock).toHaveBeenCalledWith({
      ...mockEvent,
      entryEndDate: '2025-01-01T00:00:00Z',
      modifiedAt: '2025-03-22T10:45:33.000Z',
      modifiedBy: 'Test User',
      state: 'confirmed',
    })
    expect(res.statusCode).toEqual(200)
  })

  it('should not update original entryEndDate', async () => {
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({
      ...mockEvent,
      entryEndDate: '2025-01-01T00:00:00Z',
      entryOrigEndDate: '2024-06-01T00:00:00Z',
      state: 'confirmed',
    })

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ entryEndDate: '2025-02-02T00:00:00Z', id: 'existing' })
    )

    expect(saveEventMock).toHaveBeenCalledWith({
      ...mockEvent,
      entryEndDate: '2025-02-02T00:00:00Z',
      entryOrigEndDate: '2024-06-01T00:00:00Z',
      modifiedAt: '2025-03-22T10:45:33.000Z',
      modifiedBy: 'Test User',
      state: 'confirmed',
    })
    expect(res.statusCode).toEqual(200)
  })

  it('should set qualificationStartDate for existing NOME-B SM', async () => {
    const qualificationStartDate = '2024-02-02T00:00:00Z'
    const entryEndDate = '2025-01-01T00:00:00Z'
    authorizeMock.mockResolvedValueOnce(mockSecretary)
    getEventMock.mockResolvedValueOnce({ ...mockEvent, entryEndDate, eventType: 'NOME-B SM' })
    findQualificationStartDateMock.mockResolvedValueOnce(qualificationStartDate)

    const res = await putEventLambda(
      constructAPIGwEvent<Partial<JsonDogEvent>>({ description: 'testing', id: 'existing' })
    )

    expect(findQualificationStartDateMock).toHaveBeenCalledWith('NOME-B SM', entryEndDate)
    expect(updateRegistrationsMock).not.toHaveBeenCalled()
    expect(saveEventMock).toHaveBeenCalledWith({
      ...mockEvent,
      description: 'testing',
      entryEndDate,
      eventType: 'NOME-B SM',
      modifiedAt: '2025-03-22T10:45:33.000Z',
      modifiedBy: 'Test User',
      qualificationStartDate,
    })
    expect(res.statusCode).toEqual(200)
  })
})
