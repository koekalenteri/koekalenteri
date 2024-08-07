import type KLAPI from '../lib/KLAPI'
import type { KLKoira } from '../types/KLAPI'
import type CustomDynamoClient from '../utils/CustomDynamoClient'

import { jest } from '@jest/globals'

import { LambdaError } from '../lib/lambda'
import { constructAPIGwEvent } from '../test-utils/helpers'

const mockDynamoDB: jest.Mocked<CustomDynamoClient> = {
  write: jest.fn(),
  // @ts-expect-error types don't quite match
  query: jest.fn(),
  update: jest.fn(),
  // @ts-expect-error types don't quite match
  read: jest.fn(),
  delete: jest.fn(),
}

// @ts-expect-error partial mock
const mockKLAPI: jest.Mocked<KLAPI> = {
  lueKoiranPerustiedot: jest.fn(),
  lueKoiranKoetulokset: jest.fn(),
}

jest.unstable_mockModule('../lib/KLAPI', () => ({
  default: jest.fn(() => mockKLAPI),
}))

jest.unstable_mockModule('../utils/CustomDynamoClient', () => ({
  default: jest.fn(() => mockDynamoDB),
}))

const { default: getDogHandler } = await import('./handler')

describe('getDogHandler', () => {
  jest.spyOn(console, 'debug').mockImplementation(() => undefined)
  const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined)

  beforeAll(() => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-06-20T10:00:00.000Z'))
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  afterAll(() => {
    jest.useRealTimers()
  })

  it('should handle basic 404', async () => {
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({ status: 404, error: 'not found' })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    expect(mockDynamoDB.read).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
    expect(mockDynamoDB.read).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toBe(404)
    expect(res.body).toBe(JSON.stringify({ error: 'Upstream error: not found' }))

    expect(logSpy).toHaveBeenCalledWith('cached: undefined')
    expect(logSpy).toHaveBeenCalledWith('itemAge: 0, refresh: false')
    expect(logSpy).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledWith('lueKoiranPerustiedot failed', {
      status: 404,
      json: undefined,
      error: 'not found',
    })
    expect(errorSpy).toHaveBeenCalledWith(expect.any(LambdaError))
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })

  it('should handle cached dog that has been marked diseased', async () => {
    mockDynamoDB.read.mockResolvedValueOnce({ regNo: 'FI12345/24', refreshDate: '2023-01-01' })
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({ status: 404, error: 'diseased' })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    expect(mockDynamoDB.read).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
    expect(mockDynamoDB.read).toHaveBeenCalledTimes(1)
    expect(mockDynamoDB.delete).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
    expect(mockDynamoDB.delete).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toBe(404)
    expect(res.body).toBe(JSON.stringify({ error: 'Upstream error: diseased' }))

    expect(logSpy).toHaveBeenCalledWith('cached: {"regNo":"FI12345/24","refreshDate":"2023-01-01"}')
    expect(logSpy).toHaveBeenCalledWith('itemAge: 772440, refresh: true')
    expect(logSpy).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledWith('lueKoiranPerustiedot failed', {
      status: 404,
      json: undefined,
      error: 'diseased',
    })
    expect(errorSpy).toHaveBeenCalledWith(expect.any(LambdaError))
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })

  it('should refresh data', async () => {
    mockDynamoDB.read.mockResolvedValueOnce({ regNo: 'FI12345/24', refreshDate: '2023-01-01' })
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({
      status: 200,
      json: {
        id: 123,
        rekisterinumero: 'FI12345/24',
        tunnistusmerkintä: '456',
        nimi: 'koera',
        rotukoodi: '122',
        tittelit: '',
        syntymäaika: '2021-01-01T00:00:00',
        sukupuoli: 'female',
      } as KLKoira,
    })
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({ status: 200, json: [] })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      // existing
      regNo: 'FI12345/24',
      refreshDate: '2024-06-20T10:00:00.000Z',

      // lueKoiranPerustiedot
      breedCode: '122',
      dob: '2021-01-01T00:00:00',
      gender: 'F',
      kcId: 123,
      name: 'koera',
      rfid: '456',
      titles: '',

      // luekoiranKoetulokset
      results: [],
    }

    expect(mockDynamoDB.read).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
    expect(mockDynamoDB.read).toHaveBeenCalledTimes(1)
    expect(mockDynamoDB.write).toHaveBeenCalledWith(refreshedDog)
    expect(mockDynamoDB.write).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(JSON.stringify(refreshedDog))

    expect(logSpy).toHaveBeenCalledWith('cached: {"regNo":"FI12345/24","refreshDate":"2023-01-01"}')
    expect(logSpy).toHaveBeenCalledWith('itemAge: 772440, refresh: true')
    expect(logSpy).toHaveBeenCalledTimes(2)
  })

  it('should not refresh fresh data', async () => {
    const cachedDog = {
      regNo: 'FI12345/24',
      refreshDate: '2024-06-20T09:55:00.000Z',
    }

    mockDynamoDB.read.mockResolvedValueOnce(cachedDog)
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    expect(mockKLAPI.lueKoiranPerustiedot).not.toHaveBeenCalled()

    expect(mockDynamoDB.read).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
    expect(mockDynamoDB.read).toHaveBeenCalledTimes(1)
    expect(mockDynamoDB.write).not.toHaveBeenCalled()

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(JSON.stringify(cachedDog))

    expect(logSpy).toHaveBeenCalledWith('cached: {"regNo":"FI12345/24","refreshDate":"2024-06-20T09:55:00.000Z"}')
    expect(logSpy).toHaveBeenCalledWith('itemAge: 5, refresh: false')
    expect(logSpy).toHaveBeenCalledTimes(2)
  })
})
