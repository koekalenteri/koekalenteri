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

  it('should handle multiple tildes in regNo', async () => {
    mockDynamoDB.read.mockResolvedValueOnce({ regNo: 'FI123/45/67', refreshDate: '2024-06-20T09:55:00.000Z' })
    await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI123~45~67' } }))
    expect(mockDynamoDB.read).toHaveBeenCalledWith({ regNo: 'FI123/45/67' })
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

  it('should return dog with empty results when lueKoiranKoetulokset fails', async () => {
    mockDynamoDB.read.mockResolvedValueOnce(undefined)
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
    mockKLAPI.lueKoiranKoetulokset.mockRejectedValueOnce(new Error('KLAPI error'))
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      breedCode: '122',
      dob: '2021-01-01T00:00:00',
      gender: 'F',
      kcId: 123,
      name: 'koera',
      refreshDate: '2024-06-20T10:00:00.000Z',
      regNo: 'FI12345/24',
      rfid: '456',
      titles: '',
      results: [],
    }

    expect(mockDynamoDB.read).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
    expect(mockDynamoDB.read).toHaveBeenCalledTimes(1)
    expect(mockDynamoDB.write).toHaveBeenCalledWith(refreshedDog)
    expect(mockDynamoDB.write).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual(refreshedDog)

    expect(errorSpy).toHaveBeenCalledWith(new Error('KLAPI error'), 'readDogResultsFromKlapi failed')
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

  it('should return dog with empty results when lueKoiranKoetulokset returns non-200', async () => {
    mockDynamoDB.read.mockResolvedValueOnce(undefined)
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
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({ status: 500, json: [] })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      breedCode: '122',
      dob: '2021-01-01T00:00:00',
      gender: 'F',
      kcId: 123,
      name: 'koera',
      refreshDate: '2024-06-20T10:00:00.000Z',
      regNo: 'FI12345/24',
      rfid: '456',
      titles: '',
      results: [],
    }

    expect(JSON.parse(res.body)).toEqual(refreshedDog)
    expect(errorSpy).toHaveBeenCalledWith('lueKoiranKoetulokset failed', '{"status":500,"json":[]}')
  })

  it('should parse results from KLAPI', async () => {
    mockDynamoDB.read.mockResolvedValueOnce(undefined)
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
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({
      status: 200,
      json: [
        {
          koemuoto: 'NOME-B',
          tapahtumanTyyppi: 'kansainvälinen',
          luokka: 'ALO',
          aika: '2024-01-01',
          tulos: 'ALO1',
          tuomari: 'Tuomari A',
          paikkakunta: 'Helsinki',
          tarkenne: '',
          lisämerkinnät: 'sert',
          pisteet: 95,
          sijoitus: 1,
        },
        {
          koemuoto: 'NOME-B',
          tapahtumanTyyppi: 'kansallinen',
          luokka: 'AVO',
          aika: '2024-02-01',
          tulos: 'AVO2',
          tuomari: 'Tuomari B',
          paikkakunta: 'Espoo',
          tarkenne: '',
          lisämerkinnät: 'vara-sert',
          pisteet: 85,
          sijoitus: 2,
        },
        {
          koemuoto: 'NOME-A',
          tapahtumanTyyppi: 'kansainvälinen',
          luokka: 'VOI',
          aika: '2024-03-01',
          tulos: 'VOI1',
          tuomari: 'Tuomari C',
          paikkakunta: 'Vantaa',
          tarkenne: '',
          lisämerkinnät: 'cacit',
          pisteet: 98,
          sijoitus: 1,
        },
        {
          koemuoto: 'NOME-A',
          tapahtumanTyyppi: 'kansallinen',
          luokka: 'VOI',
          aika: '2024-04-01',
          tulos: 'VOI1',
          tuomari: 'Tuomari D',
          paikkakunta: 'Turku',
          tarkenne: '',
          lisämerkinnät: 'vara cacit',
          pisteet: 97,
          sijoitus: 2,
        },
      ],
    })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      breedCode: '122',
      dob: '2021-01-01T00:00:00',
      gender: 'F',
      kcId: 123,
      name: 'koera',
      refreshDate: '2024-06-20T10:00:00.000Z',
      regNo: 'FI12345/24',
      rfid: '456',
      titles: '',
      results: [
        {
          type: 'NOME-B',
          subType: 'kansainvälinen',
          class: 'ALO',
          date: '2024-01-01',
          result: 'ALO1',
          judge: 'Tuomari A',
          location: 'Helsinki',
          ext: '',
          notes: 'sert',
          points: 95,
          rank: 1,
          cert: true,
          resCert: false,
          cacit: false,
          resCacit: false,
        },
        {
          type: 'NOME-B',
          subType: 'kansallinen',
          class: 'AVO',
          date: '2024-02-01',
          result: 'AVO2',
          judge: 'Tuomari B',
          location: 'Espoo',
          ext: '',
          notes: 'vara-sert',
          points: 85,
          rank: 2,
          cert: false,
          resCert: true,
          cacit: false,
          resCacit: false,
        },
        {
          type: 'NOME-A',
          subType: 'kansainvälinen',
          class: 'VOI',
          date: '2024-03-01',
          result: 'VOI1',
          judge: 'Tuomari C',
          location: 'Vantaa',
          ext: '',
          notes: 'cacit',
          points: 98,
          rank: 1,
          cert: false,
          resCert: false,
          cacit: true,
          resCacit: false,
        },
        {
          type: 'NOME-A',
          subType: 'kansallinen',
          class: 'VOI',
          date: '2024-04-01',
          result: 'VOI1',
          judge: 'Tuomari D',
          location: 'Turku',
          ext: '',
          notes: 'vara cacit',
          points: 97,
          rank: 2,
          cert: false,
          resCert: false,
          cacit: false,
          resCacit: true,
        },
      ],
    }

    expect(JSON.parse(res.body)).toEqual(refreshedDog)
  })

  it('should handle null results from KLAPI', async () => {
    mockDynamoDB.read.mockResolvedValueOnce(undefined)
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
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({
      status: 200,
      json: null as any,
    })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      breedCode: '122',
      dob: '2021-01-01T00:00:00',
      gender: 'F',
      kcId: 123,
      name: 'koera',
      refreshDate: '2024-06-20T10:00:00.000Z',
      regNo: 'FI12345/24',
      rfid: '456',
      titles: '',
      results: [],
    }

    expect(JSON.parse(res.body)).toEqual(refreshedDog)
  })

  it('should refresh data when refresh query parameter is present', async () => {
    mockDynamoDB.read.mockResolvedValueOnce({ regNo: 'FI12345/24', refreshDate: '2024-06-20T09:55:00.000Z' })
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
    const res = await getDogHandler(
      constructAPIGwEvent('test', {
        pathParameters: { regNo: 'FI12345~24' },
        query: { refresh: 'true' },
      })
    )

    expect(mockDynamoDB.read).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
    expect(mockDynamoDB.write).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(logSpy).toHaveBeenCalledWith('itemAge: 5, refresh: true')
  })

  it('should handle sire and dam API failures', async () => {
    mockDynamoDB.read.mockResolvedValueOnce(undefined)
    mockKLAPI.lueKoiranPerustiedot
      .mockResolvedValueOnce({
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
          id_Isä: 456,
          id_Emä: 789,
        } as KLKoira,
      })
      .mockResolvedValueOnce({ status: 404 }) // sire fails
      .mockResolvedValueOnce({ status: 404 }) // dam fails
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({ status: 200, json: [] })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      breedCode: '122',
      dob: '2021-01-01T00:00:00',
      gender: 'F',
      kcId: 123,
      name: 'koera',
      refreshDate: '2024-06-20T10:00:00.000Z',
      regNo: 'FI12345/24',
      rfid: '456',
      titles: '',
      results: [],
      // sire and dam not set due to failures
    }

    expect(JSON.parse(res.body)).toEqual(refreshedDog)
  })

  it('should fetch and include sire and dam successfully', async () => {
    mockDynamoDB.read.mockResolvedValueOnce(undefined)
    mockKLAPI.lueKoiranPerustiedot
      .mockResolvedValueOnce({
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
          id_Isä: 456,
          id_Emä: 789,
        } as KLKoira,
      })
      .mockResolvedValueOnce({
        status: 200,
        json: {
          rekisterinumero: 'FI99999/20',
          nimi: 'Sire Name',
          tittelit: 'CH',
        } as KLKoira,
      })
      .mockResolvedValueOnce({
        status: 200,
        json: {
          rekisterinumero: 'FI88888/19',
          nimi: 'Dam Name',
          tittelit: 'INT CH',
        } as KLKoira,
      })
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({ status: 200, json: [] })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      breedCode: '122',
      dob: '2021-01-01T00:00:00',
      gender: 'F',
      kcId: 123,
      name: 'koera',
      refreshDate: '2024-06-20T10:00:00.000Z',
      regNo: 'FI12345/24',
      rfid: '456',
      titles: '',
      results: [],
      sire: { name: 'CH Sire Name' },
      dam: { name: 'INT CH Dam Name' },
    }

    expect(JSON.parse(res.body)).toEqual(refreshedDog)
  })

  it('should handle different gender mappings', async () => {
    mockDynamoDB.read.mockResolvedValueOnce(undefined)
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
        sukupuoli: 'uros',
      } as KLKoira,
    })
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({ status: 200, json: [] })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    expect(JSON.parse(res.body).gender).toBe('M')
  })

  it('should handle KLAPI 200 response without rekisterinumero', async () => {
    mockDynamoDB.read.mockResolvedValueOnce({ regNo: 'FI12345/24', name: 'existing' })
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({
      status: 200,
      json: {
        id: 123,
        tunnistusmerkintä: '456',
        nimi: 'koera',
        rotukoodi: '122',
        tittelit: '',
        syntymäaika: '2021-01-01T00:00:00',
        sukupuoli: 'female',
        // no rekisterinumero
      } as KLKoira,
    })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    // Should return the existing dog without refreshing
    expect(JSON.parse(res.body)).toEqual({ regNo: 'FI12345/24', name: 'existing' })
    expect(mockDynamoDB.write).not.toHaveBeenCalled()
  })
})
