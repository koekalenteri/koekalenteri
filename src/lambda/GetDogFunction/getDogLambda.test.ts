import type { JsonDog, JsonEventType } from '../../types'
import type KLAPI from '../lib/KLAPI'
import type { KLKoetulos, KLKoira } from '../types/KLAPI'
import { vi } from 'vitest'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { loggedLines } from '../test-utils/logs'

const mockReadDog = vi.fn<(regNo: string) => Promise<JsonDog | undefined>>()
const mockWriteDog = vi.fn<(dog: JsonDog) => Promise<void>>()
const mockDeleteDog = vi.fn<(regNo: string) => Promise<void>>()

vi.doMock('../lib/repositories/dogRepository', () => ({
  deleteDog: mockDeleteDog,
  readDog: mockReadDog,
  writeDog: mockWriteDog,
}))

// The event types, read for the active ones the results are filtered by.
const mockReadAll = vi.fn<() => Promise<Pick<JsonEventType, 'active' | 'eventType'>[]>>()

vi.doMock('../lib/repositories/eventTypeRepository', () => ({
  readEventTypes: mockReadAll,
}))

// @ts-expect-error partial mock
const mockKLAPI: import('vitest').Mocked<KLAPI> = {
  lueKoiranKoetulokset: vi.fn(),
  lueKoiranPerustiedot: vi.fn(),
}

vi.doMock('../lib/KLAPI', () => ({
  default: vi.fn(function MockKLAPI() {
    return mockKLAPI
  }),
}))

const { default: getDogHandler, filterDogResults } = await import('./handler')

describe('getDogHandler', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  beforeAll(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-06-20T10:00:00.000Z'))
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockReadAll.mockResolvedValue([
      { active: true, eventType: 'NOU' },
      { active: true, eventType: 'NOME-B' },
      { active: true, eventType: 'NOME-A' },
      { active: true, eventType: 'NOWT' },
    ])
  })

  afterAll(() => {
    vi.useRealTimers()
  })

  it('filters dog results using active event types without mutating the stored dog', () => {
    const result = {
      class: 'ALO',
      date: '2024-01-01',
      judge: 'Judge',
      location: 'Helsinki',
      result: 'ALO1',
    }
    const dog = {
      regNo: 'FI12345/24',
      results: [
        { ...result, type: 'NOME-B' },
        { ...result, type: 'VEPE' },
        { ...result, type: 'NOU' },
      ],
    }

    const filtered = filterDogResults(dog, [
      { active: true, eventType: 'NOME-B' },
      { active: false, eventType: 'VEPE' },
      { active: true, eventType: 'NOU' },
    ])

    expect(filtered.results).toEqual([
      expect.objectContaining({ type: 'NOME-B' }),
      expect.objectContaining({ type: 'NOU' }),
    ])
    expect(dog.results).toHaveLength(3)
  })

  it('should handle basic 404', async () => {
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({ error: 'not found', status: 404 })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    expect(mockReadDog).toHaveBeenCalledWith('FI12345/24')
    expect(mockReadDog).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toBe(404)
    expect(res.body).toBe(JSON.stringify({ error: 'Upstream error: not found' }))

    expect(loggedLines(debugSpy)).toContainEqual(
      expect.objectContaining({ cached: false, itemAge: 0, message: 'cached dog', refresh: false })
    )
    expect(loggedLines(errorSpy)).toContainEqual(
      expect.objectContaining({ error: 'not found', message: 'lueKoiranPerustiedot failed', status: 404 })
    )
    // The upstream failure is logged; the 404 it becomes is the request's answer, not an error of ours.
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('should handle multiple tildes in regNo', async () => {
    mockReadDog.mockResolvedValueOnce({ refreshDate: '2024-06-20T09:55:00.000Z', regNo: 'FI123/45/67' })
    await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI123~45~67' } }))
    expect(mockReadDog).toHaveBeenCalledWith('FI123/45/67')
  })

  it('should handle cached dog that has been marked diseased', async () => {
    mockReadDog.mockResolvedValueOnce({ refreshDate: '2023-01-01', regNo: 'FI12345/24' })
    mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({ error: 'diseased', status: 404 })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    expect(mockReadDog).toHaveBeenCalledWith('FI12345/24')
    expect(mockReadDog).toHaveBeenCalledTimes(1)
    expect(mockDeleteDog).toHaveBeenCalledWith('FI12345/24')
    expect(mockDeleteDog).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toBe(404)
    expect(res.body).toBe(JSON.stringify({ error: 'Upstream error: diseased' }))

    expect(loggedLines(debugSpy)).toContainEqual(
      expect.objectContaining({ cached: true, itemAge: 772440, message: 'cached dog', refresh: true })
    )
    expect(loggedLines(errorSpy)).toContainEqual(
      expect.objectContaining({ error: 'diseased', message: 'lueKoiranPerustiedot failed', status: 404 })
    )
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('should refresh data', async () => {
    mockReadDog.mockResolvedValueOnce({ refreshDate: '2023-01-01', regNo: 'FI12345/24' })
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
      dob: '2021-01-01',
      gender: 'F',
      kcId: 123,
      name: 'koera',
      refreshDate: '2024-06-20T10:00:00.000Z',
      regNo: 'FI12345/24',
      results: [],
      rfid: '456',
      titles: '',
    }

    expect(mockReadDog).toHaveBeenCalledWith('FI12345/24')
    expect(mockReadDog).toHaveBeenCalledTimes(1)
    expect(mockWriteDog).toHaveBeenCalledWith(refreshedDog)
    expect(mockWriteDog).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual(refreshedDog)

    expect(loggedLines(debugSpy)).toContainEqual(
      expect.objectContaining({ cached: true, itemAge: 772440, message: 'cached dog', refresh: true })
    )
  })

  // Kennelliitto's days are stored as day keys (KOE-1548); its empty date and a missing one leave no
  // birth date, and the put replaces the row, so a birth date stored earlier does not linger.
  describe("Kennelliitto's days", () => {
    const refreshWith = async (syntymäaika: string | null, aika: string) => {
      mockReadDog.mockResolvedValueOnce({ dob: '2020-05-05', refreshDate: '2023-01-01', regNo: 'FI12345/24' })
      mockKLAPI.lueKoiranPerustiedot.mockResolvedValueOnce({
        json: {
          id: 123,
          nimi: 'koera',
          rekisterinumero: 'FI12345/24',
          rotukoodi: '122',
          sukupuoli: 'female',
          // @ts-expect-error the old API's type says string; a missing birth date comes as null
          syntymäaika,
        },
        status: 200,
      })
      mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({
        json: [{ aika, koemuoto: 'NOU', luokka: '', paikkakunta: 'L', tulos: 'NOU1', tuomari: 'J' } as KLKoetulos],
        status: 200,
      })
      await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))
    }

    it.each([
      ['a stamp', '2021-01-01T00:00:00', '2024-06-01T00:00:00'],
      ['a bare day', '2021-01-01', '2024-06-01'],
    ])('stores the birth date and the result day of %s as keys', async (_name, syntymäaika, aika) => {
      await refreshWith(syntymäaika, aika)

      expect(mockWriteDog).toHaveBeenLastCalledWith(
        expect.objectContaining({ dob: '2021-01-01', results: [expect.objectContaining({ date: '2024-06-01' })] })
      )
    })

    it.each([
      ['its empty date', '0001-01-01T00:00:00'],
      ['no birth date', null],
    ])('stores no birth date for %s, whatever the row held', async (_name, syntymäaika) => {
      await refreshWith(syntymäaika, '0001-01-01T00:00:00')

      expect(mockWriteDog).toHaveBeenLastCalledWith(
        expect.objectContaining({ dob: undefined, results: [expect.objectContaining({ date: '' })] })
      )
    })
  })

  it('should return dog with empty results when lueKoiranKoetulokset fails', async () => {
    mockReadDog.mockResolvedValueOnce(undefined)
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
      dob: '2021-01-01',
      gender: 'F',
      kcId: 123,
      name: 'koera',
      refreshDate: '2024-06-20T10:00:00.000Z',
      regNo: 'FI12345/24',
      results: [],
      rfid: '456',
      titles: '',
    }

    expect(mockReadDog).toHaveBeenCalledWith('FI12345/24')
    expect(mockReadDog).toHaveBeenCalledTimes(1)
    expect(mockWriteDog).toHaveBeenCalledWith(refreshedDog)
    expect(mockWriteDog).toHaveBeenCalledTimes(1)

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual(refreshedDog)

    expect(loggedLines(errorSpy)).toContainEqual(
      expect.objectContaining({
        error: expect.objectContaining({ message: 'KLAPI error' }),
        message: 'readDogResultsFromKlapi failed',
        regNo: 'FI12345/24',
      })
    )
  })

  it('should not refresh fresh data', async () => {
    const cachedDog = {
      refreshDate: '2024-06-20T09:55:00.000Z',
      regNo: 'FI12345/24',
    }

    mockReadDog.mockResolvedValueOnce(cachedDog)
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    expect(mockKLAPI.lueKoiranPerustiedot).not.toHaveBeenCalled()

    expect(mockReadDog).toHaveBeenCalledWith('FI12345/24')
    expect(mockReadDog).toHaveBeenCalledTimes(1)
    expect(mockWriteDog).not.toHaveBeenCalled()

    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual(JSON.stringify(cachedDog))

    expect(loggedLines(debugSpy)).toContainEqual(
      expect.objectContaining({ cached: true, itemAge: 5, message: 'cached dog', refresh: false })
    )
  })

  it('filters cached results in the endpoint response using active event types', async () => {
    const result = {
      class: 'ALO',
      date: '2024-01-01',
      judge: 'Judge',
      location: 'Helsinki',
      result: 'ALO1',
    }
    const cachedDog = {
      refreshDate: '2024-06-20T09:55:00.000Z',
      regNo: 'FI12345/24',
      results: [
        { ...result, type: 'NOME-B' },
        { ...result, type: 'VEPE' },
      ],
    }
    mockReadDog.mockResolvedValueOnce(cachedDog)
    mockReadAll.mockResolvedValueOnce([
      { active: true, eventType: 'NOME-B' },
      { active: false, eventType: 'VEPE' },
    ])

    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    expect(mockReadAll).toHaveBeenCalledWith()
    expect(JSON.parse(res.body).results).toEqual([expect.objectContaining({ type: 'NOME-B' })])
    expect(mockWriteDog).not.toHaveBeenCalled()
  })

  it('should return dog with empty results when lueKoiranKoetulokset returns non-200', async () => {
    mockReadDog.mockResolvedValueOnce(undefined)
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
      dob: '2021-01-01',
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
    expect(loggedLines(errorSpy)).toContainEqual(
      expect.objectContaining({ message: 'lueKoiranKoetulokset failed', regNo: 'FI12345/24', status: 500 })
    )
  })

  it('should parse results from KLAPI', async () => {
    mockReadDog.mockResolvedValueOnce(undefined)
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
        {
          aika: '2024-05-01',
          koemuoto: 'VEPE',
          lisämerkinnät: '',
          luokka: 'ALO',
          paikkakunta: 'Tampere',
          pisteet: 90,
          sijoitus: 1,
          tapahtumanTyyppi: 'kansallinen',
          tarkenne: '',
          tulos: 'ALO1',
          tuomari: 'Tuomari E',
        },
      ],
      status: 200,
    })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      breedCode: '122',
      dob: '2021-01-01',
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
    expect(mockWriteDog).toHaveBeenCalledWith(
      expect.objectContaining({
        results: [...refreshedDog.results, expect.objectContaining({ type: 'VEPE' })],
      })
    )
  })

  it('should handle null results from KLAPI', async () => {
    mockReadDog.mockResolvedValueOnce(undefined)
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
      // The wire can carry a literal null where the type says optional
      json: null as unknown as undefined,
      status: 200,
    })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      breedCode: '122',
      dob: '2021-01-01',
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
    mockReadDog.mockResolvedValueOnce({ refreshDate: '2024-06-20T09:55:00.000Z', regNo: 'FI12345/24' })
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

    expect(mockReadDog).toHaveBeenCalledWith('FI12345/24')
    expect(mockWriteDog).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(loggedLines(debugSpy)).toContainEqual(
      expect.objectContaining({ itemAge: 5, message: 'cached dog', refresh: true })
    )
  })

  it('should handle sire and dam API failures', async () => {
    mockReadDog.mockResolvedValueOnce(undefined)
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
      dob: '2021-01-01',
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
    mockReadDog.mockResolvedValueOnce(undefined)
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
          nimi: ' Sire Name ',
          rekisterinumero: 'FI99999/20',
          tittelit: ' CH ',
        } as KLKoira,
        status: 200,
      })
      .mockResolvedValueOnce({
        json: {
          nimi: ' Dam Name ',
          rekisterinumero: 'FI88888/19',
          tittelit: ' ',
        } as KLKoira,
        status: 200,
      })
    mockKLAPI.lueKoiranKoetulokset.mockResolvedValueOnce({ json: [], status: 200 })
    const res = await getDogHandler(constructAPIGwEvent('test', { pathParameters: { regNo: 'FI12345~24' } }))

    const refreshedDog = {
      breedCode: '122',
      dam: { name: 'Dam Name' },
      dob: '2021-01-01',
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
    mockReadDog.mockResolvedValueOnce(undefined)
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
    mockReadDog.mockResolvedValueOnce({ name: 'existing', regNo: 'FI12345/24' })
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
    expect(mockWriteDog).not.toHaveBeenCalled()
  })
})
