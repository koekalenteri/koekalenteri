import type KLAPI from '../lib/KLAPI'
import type { KLKoira } from '../types/KLAPI'
import type CustomDynamoClient from '../utils/CustomDynamoClient'
import { jest } from '@jest/globals'
import { LambdaError } from '../lib/lambda'
import { constructAPIGwEvent } from '../test-utils/helpers'

const mockDynamoDB: jest.Mocked<CustomDynamoClient> = {
  delete: jest.fn(),
  // @ts-expect-error types don't quite match
  query: jest.fn(),
  // @ts-expect-error types don't quite match
  read: jest.fn(),
  update: jest.fn(),
  write: jest.fn(),
}

// @ts-expect-error partial mock
const mockKLAPI: jest.Mocked<KLAPI> = {
  lueKoiranKoetulokset: jest.fn(),
  lueKoiranPerustiedot: jest.fn(),
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
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({ error: 'not found', status: 404 })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    expect(mockDynamoDB.read).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
    expect(mockDynamoDB.read).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toBe(404)
    expect(res.body).toBe(JSON.stringify({ error: 'Upstream error: not found' }))

    expect(logSpy).toHaveBeenCalledWith('cached: undefined')
    expect(logSpy).toHaveBeenCalledWith('itemAge: 0, refresh: false')
    expect(logSpy).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledWith('lueKoiranPerustiedot failed', {
      error: 'not found',
      json: undefined,
      status: 404,
    })
    expect(errorSpy).toHaveBeenCalledWith(expect.any(LambdaError))
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })

  it('should handle multiple tildes in regNo', async () => {
    mockDynamoDB.read.mockResolvedValueOnce({ refreshDate: '2024-06-20T09:55:00.000Z', regNo: 'FI123/45/67' })
    await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI123~45~67' } }))
    expect(mockDynamoDB.read).toHaveBeenCalledWith({ regNo: 'FI123/45/67' })
  })

  it('should handle cached dog that has been marked diseased', async () => {
    mockDynamoDB.read.mockResolvedValueOnce({ refreshDate: '2023-01-01', regNo: 'FI12345/24' })
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({ error: 'diseased', status: 404 })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    expect(mockDynamoDB.read).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
    expect(mockDynamoDB.read).toHaveBeenCalledTimes(1)
    expect(mockDynamoDB.delete).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
    expect(mockDynamoDB.delete).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toBe(404)
    expect(res.body).toBe(JSON.stringify({ error: 'Upstream error: diseased' }))

    expect(logSpy).toHaveBeenCalledWith('cached: {"refreshDate":"2023-01-01","regNo":"FI12345/24"}')
    expect(logSpy).toHaveBeenCalledWith('itemAge: 772440, refresh: true')
    expect(logSpy).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledWith('lueKoiranPerustiedot failed', {
      error: 'diseased',
      json: undefined,
      status: 404,
    })
    expect(errorSpy).toHaveBeenCalledWith(expect.any(LambdaError))
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })

  it('should refresh data', async () => {
    mockDynamoDB.read.mockResolvedValueOnce({ refreshDate: '2023-01-01', regNo: 'FI12345/24' })
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({
      json: {
        id: 123,
        nimi: 'koera',
        rekisterinumero: 'FI12345/24',
        rotukoodi: '122',
        sukupuoli: 'female',
        syntymäaika: '2021-01-01T00:00:00',
        tittelit: '',
        tunnistusmerkintä: '456',
      } as KLKoira,
      status: 200,
    })
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({ json: [], status: 200 })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      breedCode: '122',
      dob: '2021-01-01T00:00:00',
      gender: 'F',
      kcId: 123,
      name: 'koera',
      refreshDate: '2024-06-20T10:00:00.000Z',
      regNo: 'FI12345/24',
      results: [],
      rfid: '456',
      titles: '',
    }

    expect(mockDynamoDB.read).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
    expect(mockDynamoDB.read).toHaveBeenCalledTimes(1)
    expect(mockDynamoDB.write).toHaveBeenCalledWith(refreshedDog)
    expect(mockDynamoDB.write).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual(refreshedDog)

    expect(logSpy).toHaveBeenCalledWith('cached: {"refreshDate":"2023-01-01","regNo":"FI12345/24"}')
    expect(logSpy).toHaveBeenCalledWith('itemAge: 772440, refresh: true')
    expect(logSpy).toHaveBeenCalledTimes(2)
  })

  it('should return dog with empty results when lueKoiranKoetulokset fails', async () => {
    mockDynamoDB.read.mockResolvedValueOnce(undefined)
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({
      json: {
        id: 123,
        nimi: 'koera',
        rekisterinumero: 'FI12345/24',
        rotukoodi: '122',
        sukupuoli: 'female',
        syntymäaika: '2021-01-01T00:00:00',
        tittelit: '',
        tunnistusmerkintä: '456',
      } as KLKoira,
      status: 200,
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
      results: [],
      rfid: '456',
      titles: '',
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
      refreshDate: '2024-06-20T09:55:00.000Z',
      regNo: 'FI12345/24',
    }

    mockDynamoDB.read.mockResolvedValueOnce(cachedDog)
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    expect(mockKLAPI.lueKoiranPerustiedot).not.toHaveBeenCalled()

    expect(mockDynamoDB.read).toHaveBeenCalledWith({ regNo: 'FI12345/24' })
    expect(mockDynamoDB.read).toHaveBeenCalledTimes(1)
    expect(mockDynamoDB.write).not.toHaveBeenCalled()

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(JSON.stringify(cachedDog))

    expect(logSpy).toHaveBeenCalledWith('cached: {"refreshDate":"2024-06-20T09:55:00.000Z","regNo":"FI12345/24"}')
    expect(logSpy).toHaveBeenCalledWith('itemAge: 5, refresh: false')
    expect(logSpy).toHaveBeenCalledTimes(2)
  })

  it('should return dog with empty results when lueKoiranKoetulokset returns non-200', async () => {
    mockDynamoDB.read.mockResolvedValueOnce(undefined)
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({
      json: {
        id: 123,
        nimi: 'koera',
        rekisterinumero: 'FI12345/24',
        rotukoodi: '122',
        sukupuoli: 'female',
        syntymäaika: '2021-01-01T00:00:00',
        tittelit: '',
        tunnistusmerkintä: '456',
      } as KLKoira,
      status: 200,
    })
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({ json: [], status: 500 })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      breedCode: '122',
      dob: '2021-01-01T00:00:00',
      gender: 'F',
      kcId: 123,
      name: 'koera',
      refreshDate: '2024-06-20T10:00:00.000Z',
      regNo: 'FI12345/24',
      results: [],
      rfid: '456',
      titles: '',
    }

    expect(JSON.parse(res.body)).toEqual(refreshedDog)
    expect(errorSpy).toHaveBeenCalledWith('lueKoiranKoetulokset failed', '{"json":[],"status":500}')
  })

  it('should parse results from KLAPI', async () => {
    mockDynamoDB.read.mockResolvedValueOnce(undefined)
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({
      json: {
        id: 123,
        nimi: 'koera',
        rekisterinumero: 'FI12345/24',
        rotukoodi: '122',
        sukupuoli: 'female',
        syntymäaika: '2021-01-01T00:00:00',
        tittelit: '',
        tunnistusmerkintä: '456',
      } as KLKoira,
      status: 200,
    })
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({
      json: [
        {
          aika: '2024-01-01',
          koemuoto: 'NOME-B',
          lisämerkinnät: 'sert',
          luokka: 'ALO',
          paikkakunta: 'Helsinki',
          pisteet: 95,
          sijoitus: 1,
          tapahtumanTyyppi: 'kansainvälinen',
          tarkenne: '',
          tulos: 'ALO1',
          tuomari: 'Tuomari A',
        },
        {
          aika: '2024-02-01',
          koemuoto: 'NOME-B',
          lisämerkinnät: 'vara-sert',
          luokka: 'AVO',
          paikkakunta: 'Espoo',
          pisteet: 85,
          sijoitus: 2,
          tapahtumanTyyppi: 'kansallinen',
          tarkenne: '',
          tulos: 'AVO2',
          tuomari: 'Tuomari B',
        },
        {
          aika: '2024-03-01',
          koemuoto: 'NOME-A',
          lisämerkinnät: 'cacit',
          luokka: 'VOI',
          paikkakunta: 'Vantaa',
          pisteet: 98,
          sijoitus: 1,
          tapahtumanTyyppi: 'kansainvälinen',
          tarkenne: '',
          tulos: 'VOI1',
          tuomari: 'Tuomari C',
        },
        {
          aika: '2024-04-01',
          koemuoto: 'NOME-A',
          lisämerkinnät: 'vara cacit',
          luokka: 'VOI',
          paikkakunta: 'Turku',
          pisteet: 97,
          sijoitus: 2,
          tapahtumanTyyppi: 'kansallinen',
          tarkenne: '',
          tulos: 'VOI1',
          tuomari: 'Tuomari D',
        },
      ],
      status: 200,
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
      results: [
        {
          cacit: false,
          cert: true,
          class: 'ALO',
          date: '2024-01-01',
          ext: '',
          judge: 'Tuomari A',
          location: 'Helsinki',
          notes: 'sert',
          points: 95,
          rank: 1,
          resCacit: false,
          resCert: false,
          result: 'ALO1',
          subType: 'kansainvälinen',
          type: 'NOME-B',
        },
        {
          cacit: false,
          cert: false,
          class: 'AVO',
          date: '2024-02-01',
          ext: '',
          judge: 'Tuomari B',
          location: 'Espoo',
          notes: 'vara-sert',
          points: 85,
          rank: 2,
          resCacit: false,
          resCert: true,
          result: 'AVO2',
          subType: 'kansallinen',
          type: 'NOME-B',
        },
        {
          cacit: true,
          cert: false,
          class: 'VOI',
          date: '2024-03-01',
          ext: '',
          judge: 'Tuomari C',
          location: 'Vantaa',
          notes: 'cacit',
          points: 98,
          rank: 1,
          resCacit: false,
          resCert: false,
          result: 'VOI1',
          subType: 'kansainvälinen',
          type: 'NOME-A',
        },
        {
          cacit: false,
          cert: false,
          class: 'VOI',
          date: '2024-04-01',
          ext: '',
          judge: 'Tuomari D',
          location: 'Turku',
          notes: 'vara cacit',
          points: 97,
          rank: 2,
          resCacit: true,
          resCert: false,
          result: 'VOI1',
          subType: 'kansallinen',
          type: 'NOME-A',
        },
      ],
      rfid: '456',
      titles: '',
    }

    expect(JSON.parse(res.body)).toEqual(refreshedDog)
  })

  it('should handle null results from KLAPI', async () => {
    mockDynamoDB.read.mockResolvedValueOnce(undefined)
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({
      json: {
        id: 123,
        nimi: 'koera',
        rekisterinumero: 'FI12345/24',
        rotukoodi: '122',
        sukupuoli: 'female',
        syntymäaika: '2021-01-01T00:00:00',
        tittelit: '',
        tunnistusmerkintä: '456',
      } as KLKoira,
      status: 200,
    })
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({
      json: null as any,
      status: 200,
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
      results: [],
      rfid: '456',
      titles: '',
    }

    expect(JSON.parse(res.body)).toEqual(refreshedDog)
  })

  it('should refresh data when refresh query parameter is present', async () => {
    mockDynamoDB.read.mockResolvedValueOnce({ refreshDate: '2024-06-20T09:55:00.000Z', regNo: 'FI12345/24' })
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({
      json: {
        id: 123,
        nimi: 'koera',
        rekisterinumero: 'FI12345/24',
        rotukoodi: '122',
        sukupuoli: 'female',
        syntymäaika: '2021-01-01T00:00:00',
        tittelit: '',
        tunnistusmerkintä: '456',
      } as KLKoira,
      status: 200,
    })
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({ json: [], status: 200 })
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
        json: {
          id: 123,
          id_Emä: 789,
          id_Isä: 456,
          nimi: 'koera',
          rekisterinumero: 'FI12345/24',
          rotukoodi: '122',
          sukupuoli: 'female',
          syntymäaika: '2021-01-01T00:00:00',
          tittelit: '',
          tunnistusmerkintä: '456',
        } as KLKoira,
        status: 200,
      })
      .mockResolvedValueOnce({ status: 404 }) // sire fails
      .mockResolvedValueOnce({ status: 404 }) // dam fails
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({ json: [], status: 200 })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      breedCode: '122',
      dob: '2021-01-01T00:00:00',
      gender: 'F',
      kcId: 123,
      name: 'koera',
      refreshDate: '2024-06-20T10:00:00.000Z',
      regNo: 'FI12345/24',
      results: [],
      rfid: '456',
      titles: '',
      // sire and dam not set due to failures
    }

    expect(JSON.parse(res.body)).toEqual(refreshedDog)
  })

  it('should fetch and include sire and dam successfully', async () => {
    mockDynamoDB.read.mockResolvedValueOnce(undefined)
    mockKLAPI.lueKoiranPerustiedot
      .mockResolvedValueOnce({
        json: {
          id: 123,
          id_Emä: 789,
          id_Isä: 456,
          nimi: 'koera',
          rekisterinumero: 'FI12345/24',
          rotukoodi: '122',
          sukupuoli: 'female',
          syntymäaika: '2021-01-01T00:00:00',
          tittelit: '',
          tunnistusmerkintä: '456',
        } as KLKoira,
        status: 200,
      })
      .mockResolvedValueOnce({
        json: {
          nimi: 'Sire Name',
          rekisterinumero: 'FI99999/20',
          tittelit: 'CH',
        } as KLKoira,
        status: 200,
      })
      .mockResolvedValueOnce({
        json: {
          nimi: 'Dam Name',
          rekisterinumero: 'FI88888/19',
          tittelit: 'INT CH',
        } as KLKoira,
        status: 200,
      })
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({ json: [], status: 200 })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      breedCode: '122',
      dam: { name: 'INT CH Dam Name' },
      dob: '2021-01-01T00:00:00',
      gender: 'F',
      kcId: 123,
      name: 'koera',
      refreshDate: '2024-06-20T10:00:00.000Z',
      regNo: 'FI12345/24',
      results: [],
      rfid: '456',
      sire: { name: 'CH Sire Name' },
      titles: '',
    }

    expect(JSON.parse(res.body)).toEqual(refreshedDog)
  })

  it('should handle different gender mappings', async () => {
    mockDynamoDB.read.mockResolvedValueOnce(undefined)
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({
      json: {
        id: 123,
        nimi: 'koera',
        rekisterinumero: 'FI12345/24',
        rotukoodi: '122',
        sukupuoli: 'uros',
        syntymäaika: '2021-01-01T00:00:00',
        tittelit: '',
        tunnistusmerkintä: '456',
      } as KLKoira,
      status: 200,
    })
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({ json: [], status: 200 })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    expect(JSON.parse(res.body).gender).toBe('M')
  })

  it('should handle KLAPI 200 response without rekisterinumero', async () => {
    mockDynamoDB.read.mockResolvedValueOnce({ name: 'existing', regNo: 'FI12345/24' })
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({
      json: {
        id: 123,
        nimi: 'koera',
        rotukoodi: '122',
        sukupuoli: 'female',
        syntymäaika: '2021-01-01T00:00:00',
        tittelit: '',
        tunnistusmerkintä: '456',
        // no rekisterinumero
      } as KLKoira,
      status: 200,
    })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    // Should return the existing dog without refreshing
    expect(JSON.parse(res.body)).toEqual({ name: 'existing', regNo: 'FI12345/24' })
    expect(mockDynamoDB.write).not.toHaveBeenCalled()
  })
})
