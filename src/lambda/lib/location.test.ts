import type { Location } from '../../types'
import type { LocationSnapshot } from './repositories/locationRepository'
import { vi } from 'vitest'

const read = vi.fn<() => Promise<LocationSnapshot | undefined>>()
const write = vi.fn<(snapshot: Omit<LocationSnapshot, 'id'>) => Promise<void>>()
vi.doMock('./repositories/locationRepository', () => ({
  readLocationSnapshot: read,
  writeLocationSnapshot: write,
}))

const { fetchLocations, syncLocations } = await import('./location')

const klapiResult = <T>(json: T | undefined, status = 200, error?: string) => ({ error, json, status })

const createKlapi = () => {
  const luePaikkakunnat = vi.fn()
  const lueKennelpiirit = vi.fn()
  return { klapi: { lueKennelpiirit, luePaikkakunnat }, lueKennelpiirit, luePaikkakunnat }
}

describe('fetchLocations', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Espoo and Ähtäri share paikkakuntaNumero 1 because KL numbers them within the kennelpiiri:
  // keying the collection by the number kept one municipality out of the whole country.
  it('capitalizes, dedupes by name and sorts the municipalities', async () => {
    const { klapi, luePaikkakunnat } = createKlapi()
    luePaikkakunnat.mockResolvedValueOnce(
      klapiResult([
        { kennelpiiri: 'UUDENMAAN KENNELPIIRI', kennelpiirinNumero: 2, paikkakunta: 'VANTAA', paikkakuntaNumero: 2 },
        { kennelpiiri: 'POHJANMAAN KENNELPIIRI', kennelpiirinNumero: 5, paikkakunta: 'ÄHTÄRI', paikkakuntaNumero: 1 },
        { kennelpiiri: 'UUDENMAAN KENNELPIIRI', kennelpiirinNumero: 2, paikkakunta: 'ESPOO', paikkakuntaNumero: 1 },
        { kennelpiiri: 'UUDENMAAN KENNELPIIRI', kennelpiirinNumero: 2, paikkakunta: 'ESPOO', paikkakuntaNumero: 1 },
      ])
    )

    await expect(fetchLocations(klapi)).resolves.toEqual([
      { district: 'Uudenmaan Kennelpiiri', id: 1, name: 'Espoo' },
      { district: 'Uudenmaan Kennelpiiri', id: 2, name: 'Vantaa' },
      { district: 'Pohjanmaan Kennelpiiri', id: 1, name: 'Ähtäri' },
    ])
    expect(luePaikkakunnat).toHaveBeenCalledTimes(1)
  })

  it('falls back to fetching per district when the district-less call returns nothing', async () => {
    const { klapi, lueKennelpiirit, luePaikkakunnat } = createKlapi()
    luePaikkakunnat.mockResolvedValueOnce(klapiResult([]))
    lueKennelpiirit.mockResolvedValueOnce(
      klapiResult([
        { kennelpiiri: 'Uudenmaan kennelpiiri', numero: 10 },
        { kennelpiiri: 'Pohjanmaan kennelpiiri', numero: 20 },
      ])
    )
    luePaikkakunnat
      .mockResolvedValueOnce(
        klapiResult([
          { kennelpiiri: 'Uudenmaan kennelpiiri', kennelpiirinNumero: 10, paikkakunta: 'espoo', paikkakuntaNumero: 1 },
        ])
      )
      .mockResolvedValueOnce(
        klapiResult([
          {
            kennelpiiri: 'Pohjanmaan kennelpiiri',
            kennelpiirinNumero: 20,
            paikkakunta: 'ähtäri',
            paikkakuntaNumero: 3,
          },
        ])
      )

    await expect(fetchLocations(klapi)).resolves.toEqual([
      { district: 'Uudenmaan Kennelpiiri', id: 1, name: 'Espoo' },
      { district: 'Pohjanmaan Kennelpiiri', id: 3, name: 'Ähtäri' },
    ])
    expect(luePaikkakunnat).toHaveBeenNthCalledWith(2, { KennelpiirinNumero: 10 })
    expect(luePaikkakunnat).toHaveBeenNthCalledWith(3, { KennelpiirinNumero: 20 })
  })

  it('returns undefined when the districts can not be fetched', async () => {
    const { klapi, lueKennelpiirit, luePaikkakunnat } = createKlapi()
    luePaikkakunnat.mockResolvedValueOnce(klapiResult(undefined, 500, 'oh no'))
    lueKennelpiirit.mockResolvedValueOnce(klapiResult(undefined, 500, 'oh no'))

    await expect(fetchLocations(klapi)).resolves.toBeUndefined()
  })

  it('returns undefined when a single district fails, instead of a partial list', async () => {
    const { klapi, lueKennelpiirit, luePaikkakunnat } = createKlapi()
    luePaikkakunnat.mockResolvedValueOnce(klapiResult([]))
    lueKennelpiirit.mockResolvedValueOnce(
      klapiResult([
        { kennelpiiri: 'Uudenmaan kennelpiiri', numero: 10 },
        { kennelpiiri: 'Pohjanmaan kennelpiiri', numero: 20 },
      ])
    )
    luePaikkakunnat
      .mockResolvedValueOnce(
        klapiResult([
          { kennelpiiri: 'Uudenmaan kennelpiiri', kennelpiirinNumero: 10, paikkakunta: 'espoo', paikkakuntaNumero: 1 },
        ])
      )
      .mockResolvedValueOnce(klapiResult(undefined, 500, 'oh no'))

    await expect(fetchLocations(klapi)).resolves.toBeUndefined()
  })
})

describe('syncLocations', () => {
  const locations: Location[] = [{ district: 'Uudenmaan Kennelpiiri', id: 1, name: 'Espoo' }]

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    read.mockReset()
    write.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not write when the list is unchanged', async () => {
    read.mockResolvedValueOnce({ count: 1, id: 'fi', items: locations, modifiedAt: 'earlier' })

    await expect(syncLocations(locations)).resolves.toBe(false)
    expect(write).not.toHaveBeenCalled()
  })

  it('writes a new snapshot when the list changed', async () => {
    read.mockResolvedValueOnce({ count: 1, id: 'fi', items: locations, modifiedAt: 'earlier' })
    const changed = [...locations, { district: 'Uudenmaan Kennelpiiri', id: 2, name: 'Vantaa' }]

    await expect(syncLocations(changed)).resolves.toBe(true)
    expect(write).toHaveBeenCalledWith({
      count: 2,
      items: changed,
      modifiedAt: expect.any(String),
    })
  })

  it('writes the first snapshot when there is nothing stored', async () => {
    read.mockResolvedValueOnce(undefined)

    await expect(syncLocations(locations)).resolves.toBe(true)
    expect(write).toHaveBeenCalled()
  })

  it('never empties the snapshot', async () => {
    await expect(syncLocations([])).resolves.toBe(false)
    expect(read).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })
})
