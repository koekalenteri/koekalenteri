import type { JsonUser } from '../../types'
import type KLAPI from '../lib/KLAPI'
import type CustomDynamoClient from '../utils/CustomDynamoClient'

import { jest } from '@jest/globals'

import { constructAPIGwEvent } from '../test-utils/helpers'

// @ts-expect-error partial mock
const mockKLAPI: jest.Mocked<KLAPI> = {
  lueKoemuodot: jest.fn(async () => ({ status: 200, json: [] })),
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
  update: jest.fn(),
  // @ts-expect-error types don't quite match
  readAll: jest.fn(),
}

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => mockDynamoDB),
}))

const { authorize } = await import('../lib/auth')
const authorizeMock = authorize as jest.Mock<typeof authorize>

const { default: getEventTypesLambda } = await import('./handler')

const mockUser: JsonUser = {
  id: '',
  createdAt: '',
  createdBy: 'test',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Test User',
  email: 'test@example.com',
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
      { eventType: 'y', description: { fi: 'old fi', en: 'old en', sv: 'old sv' } },
    ])
    mockKLAPI.lueKoemuodot
      .mockResolvedValueOnce({
        status: 200,
        json: [
          { lyhenne: 'x', koemuoto: 'fi' },
          { lyhenne: 'y', koemuoto: 'new fi' },
        ],
      })
      .mockResolvedValueOnce({
        status: 200,
        json: [
          { lyhenne: 'x', koemuoto: 'sv' },
          { lyhenne: 'y', koemuoto: 'old sv' },
        ],
      })
      .mockResolvedValueOnce({
        status: 200,
        json: [
          { lyhenne: 'x', koemuoto: 'en' },
          { lyhenne: 'y', koemuoto: 'new en' },
        ],
      })
    const res = await getEventTypesLambda(constructAPIGwEvent({}, { query: { refresh: 'true' } }))

    expect(mockKLAPI.lueKoemuodot).toHaveBeenCalledWith({ Kieli: 1 })
    expect(mockKLAPI.lueKoemuodot).toHaveBeenCalledWith({ Kieli: 2 })
    expect(mockKLAPI.lueKoemuodot).toHaveBeenCalledWith({ Kieli: 3 })
    expect(mockKLAPI.lueKoemuodot).toHaveBeenCalledTimes(3)

    expect(logSpy).toHaveBeenCalledWith('new eventTypes', [
      expect.objectContaining({ eventType: 'x', description: { fi: 'fi', en: 'en', sv: 'sv' } }),
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
