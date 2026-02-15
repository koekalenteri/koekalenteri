import type { JsonUser } from '../../types'
import type KLAPI from '../lib/KLAPI'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import { jest } from '@jest/globals'
import { constructAPIGwEvent } from '../test-utils/helpers'

// @ts-expect-error partial mock
const mockKLAPI: jest.Mocked<KLAPI> = {
  lueKoemuodot: jest.fn(async () => ({ json: [], status: 200 })),
}

jest.unstable_mockModule('../lib/KLAPI', () => ({
  default: jest.fn(() => mockKLAPI),
}))

jest.unstable_mockModule('../lib/api-gw', () => ({
  getOrigin: jest.fn(),
}))

jest.unstable_mockModule('../lib/auth', () => ({
  authorize: jest.fn(),
  getAndUpdateUserByEmail: jest.fn(),
}))

const mockDynamoDB: jest.Mocked<CustomDynamoClient> = {
  batchWrite: jest.fn(),
  // @ts-expect-error types don't quite match
  readAll: jest.fn(),
  update: jest.fn(),
}

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => mockDynamoDB),
}))

const { authorize } = await import('../lib/auth')
const authorizeMock = authorize as jest.Mock<typeof authorize>

const { default: getEventTypesLambda } = await import('./handler')

const mockUser: JsonUser = {
  createdAt: '',
  createdBy: 'test',
  email: 'test@example.com',
  id: '',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
}
const mockAdminUser: JsonUser = {
  ...mockUser,
  admin: true,
}

describe('getEventTypesLambda', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should return 401 if authorization fails', async () => {
    authorizeMock.mockResolvedValueOnce(null)
    const res = await getEventTypesLambda(constructAPIGwEvent({}))

    expect(res.statusCode).toEqual(401)
  })

  it('should return 401 with refresh if user is not admin', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    const res = await getEventTypesLambda(constructAPIGwEvent({}, { query: { refresh: 'true' } }))

    expect(res.statusCode).toEqual(401)
  })

  it('should update eventTypes from KLAPI', async () => {
    authorizeMock.mockResolvedValueOnce(mockAdminUser)
    mockDynamoDB.readAll.mockResolvedValueOnce([
      { description: { en: 'old en', fi: 'old fi', sv: 'old sv' }, eventType: 'y' },
    ])
    mockKLAPI.lueKoemuodot
      .mockResolvedValueOnce({
        json: [
          { koemuoto: 'fi', lyhenne: 'x' },
          { koemuoto: 'new fi', lyhenne: 'y' },
        ],
        status: 200,
      })
      .mockResolvedValueOnce({
        json: [
          { koemuoto: 'sv', lyhenne: 'x' },
          { koemuoto: 'old sv', lyhenne: 'y' },
        ],
        status: 200,
      })
      .mockResolvedValueOnce({
        json: [
          { koemuoto: 'en', lyhenne: 'x' },
          { koemuoto: 'new en', lyhenne: 'y' },
        ],
        status: 200,
      })
    const res = await getEventTypesLambda(constructAPIGwEvent({}, { query: { refresh: 'true' } }))

    expect(mockKLAPI.lueKoemuodot).toHaveBeenCalledWith({ Kieli: 1 })
    expect(mockKLAPI.lueKoemuodot).toHaveBeenCalledWith({ Kieli: 2 })
    expect(mockKLAPI.lueKoemuodot).toHaveBeenCalledWith({ Kieli: 3 })
    expect(mockKLAPI.lueKoemuodot).toHaveBeenCalledTimes(3)

    expect(logSpy).toHaveBeenCalledWith('new eventTypes', [
      expect.objectContaining({ description: { en: 'en', fi: 'fi', sv: 'sv' }, eventType: 'x' }),
    ])
    expect(logSpy).toHaveBeenCalledWith(
      'description changed for y',
      { en: 'old en', fi: 'old fi', sv: 'old sv' },
      { en: 'new en', fi: 'new fi', sv: 'old sv' }
    )
    expect(logSpy).toHaveBeenCalledTimes(2)

    expect(mockDynamoDB.batchWrite).toHaveBeenCalledWith([
      expect.objectContaining({
        createdBy: 'Test User',
        description: { en: 'en', fi: 'fi', sv: 'sv' },
        eventType: 'x',
        official: true,
      }),
    ])
    expect(mockDynamoDB.batchWrite).toHaveBeenCalledTimes(1)

    expect(mockDynamoDB.update).toHaveBeenCalledWith(
      { eventType: 'y' },
      {
        set: {
          description: { en: 'new en', fi: 'new fi', sv: 'old sv' },
          modifiedAt: expect.any(String),
          modifiedBy: 'Test User',
        },
      }
    )
    expect(mockDynamoDB.update).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toEqual(200)
  })

  it('should return all eventTypes', async () => {
    authorizeMock.mockResolvedValueOnce(mockUser)
    mockDynamoDB.readAll.mockResolvedValue([{ eventType: 'a' }, { eventType: 'b' }])

    const res = await getEventTypesLambda(constructAPIGwEvent({}))
    expect(res.statusCode).toEqual(200)
    expect(res.body).toMatchInlineSnapshot('"[{"eventType":"a"},{"eventType":"b"}]"')
  })
})
