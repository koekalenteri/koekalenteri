import type { KLAPIConfig } from '../types/KLAPI'

import { jest } from '@jest/globals'

import { KLKieli } from '../types/KLAPI'

import KLAPI from './KLAPI'

const mockConfig: KLAPIConfig = {
  KL_API_URL: 'https://api.koiraklubi.fi',
  KL_API_UID: 'testuser',
  KL_API_PWD: 'testpassword',
}

const mockLoadConfig = jest.fn(async () => mockConfig)

const originalFetch = global.fetch
global.fetch = jest.fn() as any

describe('KLAPI', () => {
  let klapi: KLAPI

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {})
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    global.fetch = originalFetch
    jest.restoreAllMocks()
  })

  beforeEach(() => {
    klapi = new KLAPI(mockLoadConfig)
    jest.clearAllMocks()
  })

  describe('lueKoiranPerustiedot', () => {
    it('should return dog data on successful fetch', async () => {
      const mockDog = { rekisterinumero: 'FI12345/21', nimi: 'Testikoira', rotu: 'Testirotu', kuollut: false }
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDog,
        status: 200,
      })

      const result = await klapi.lueKoiranPerustiedot({ Rekisterinumero: 'FI12345/21', Kieli: KLKieli.Suomi })

      expect(result.json).toEqual(mockDog)
      expect(result.status).toBe(200)
    })

    it('should return 404 if rekisterinumero is missing from response', async () => {
      const mockDog = { nimi: 'Testikoira', rotu: 'Testirotu' }
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDog,
        status: 200,
      })

      const result = await klapi.lueKoiranPerustiedot({ Rekisterinumero: 'FI12345/21', Kieli: KLKieli.Suomi })

      expect(result.status).toBe(404)
      expect(result.error).toBe('not found')
    })

    it('should return 404 if dog is deceased', async () => {
      const mockDog = { rekisterinumero: 'FI12345/21', nimi: 'Testikoira', rotu: 'Testirotu', kuollut: true }
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({
        ok: true,
        json: async () => mockDog,
        status: 200,
      })

      const result = await klapi.lueKoiranPerustiedot({ Rekisterinumero: 'FI12345/21', Kieli: KLKieli.Suomi })

      expect(result.status).toBe(404)
      expect(result.error).toBe('diseased')
    })

    it('should return 404 if no regNo or chip is provided', async () => {
      const result = await klapi.lueKoiranPerustiedot({ Kieli: KLKieli.Suomi })
      expect(result.status).toBe(404)
    })

    it('should filter out undefined params', async () => {
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rekisterinumero: 'FI12345/21' }),
        status: 200,
      })
      await klapi.lueKoiranPerustiedot({
        Rekisterinumero: 'FI12345/21',
        Kieli: KLKieli.Suomi,
        Tunnistusmerkintä: undefined,
      })
      expect(fetch).toHaveBeenCalledWith(
        'https://api.koiraklubi.fi/Koira/Lue/Perustiedot?Rekisterinumero=FI12345%2F21&Kieli=1',
        expect.any(Object)
      )
    })
  })

  describe('lueKoiranKoetulokset', () => {
    it('should return 404 if no regNo is provided', async () => {
      const result = await klapi.lueKoiranKoetulokset({ Rekisterinumero: '', Kieli: KLKieli.Suomi })
      expect(result.status).toBe(404)
    })

    it('should call get with correct params', async () => {
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({ ok: true, json: async () => [], status: 200 })
      await klapi.lueKoiranKoetulokset({ Rekisterinumero: 'FI12345/21', Kieli: KLKieli.Suomi })
      expect(fetch).toHaveBeenCalledWith(
        'https://api.koiraklubi.fi/Koira/Lue/Koetulokset?Rekisterinumero=FI12345%2F21&Kieli=1',
        expect.any(Object)
      )
    })
  })

  describe('generic GET methods', () => {
    const testCases = [
      {
        method: 'lueKoemuodot' as const,
        path: 'Koemuoto/Lue/Koemuodot',
        params: { Kieli: KLKieli.Suomi },
        expectedParams: 'Kieli=1',
      },
      {
        method: 'lueKoetulokset' as const,
        path: 'Koemuoto/Lue/Tulokset',
        params: { Koemuoto: 'NOME-B', Kieli: KLKieli.Suomi },
        expectedParams: 'Koemuoto=NOME-B&Kieli=1',
      },
      {
        method: 'lueKoemuodonTarkenteet' as const,
        path: 'Koemuoto/Lue/Tarkenteet',
        params: { Koemuoto: 'NOME-B', Kieli: KLKieli.Suomi },
        expectedParams: 'Koemuoto=NOME-B&Kieli=1',
      },
      {
        method: 'lueKoemuodonYlituomarit' as const,
        path: 'Koemuoto/Lue/Ylituomarit',
        params: { Koemuoto: 'NOME-B', Kieli: KLKieli.Suomi },
        expectedParams: 'Koemuoto=NOME-B&Kieli=1',
      },
      {
        method: 'lueKoemuodonKoetoimitsijat' as const,
        path: 'Koemuoto/Lue/Koetoimitsijat',
        params: { Koemuoto: 'NOME-B', Kieli: KLKieli.Suomi },
        expectedParams: 'Koemuoto=NOME-B&Kieli=1',
      },
      {
        method: 'lueKoetapahtumat' as const,
        path: 'Koe/Lue/Koetapahtumat',
        params: { Koemuoto: 'NOME-B', Kieli: KLKieli.Suomi },
        expectedParams: 'Koemuoto=NOME-B&Kieli=1',
      },
      { method: 'lueKennelpiirit' as const, path: 'Yleista/Lue/Kennelpiirit', params: {}, expectedParams: '' },
      {
        method: 'luePaikkakunnat' as const,
        path: 'Yleista/Lue/Paikkakunnat',
        params: { KennelpiirinNumero: 1 },
        expectedParams: 'KennelpiirinNumero=1',
      },
      {
        method: 'lueYhdistykset' as const,
        path: 'Yleista/Lue/Yhdistykset',
        params: { Kieli: KLKieli.Suomi },
        expectedParams: 'Kieli=1',
      },
      {
        method: 'lueParametrit' as const,
        path: 'Yleista/Lue/Parametrit',
        params: { Nimi: 'test', Kieli: KLKieli.Suomi },
        expectedParams: 'Nimi=test&Kieli=1',
      },
      {
        method: 'lueRoturyhmät' as const,
        path: 'Yleista/Lue/Roturyhmat',
        params: { Kieli: KLKieli.Suomi },
        expectedParams: 'Kieli=1',
      },
      {
        method: 'lueRodut' as const,
        path: 'Yleista/Lue/Rodut',
        params: { Kieli: KLKieli.Suomi },
        expectedParams: 'Kieli=1',
      },
    ]

    it.each(testCases)('should call get with correct path for $method', async ({ method, path, params }) => {
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({ ok: true, json: async () => [], status: 200 })
      // @ts-expect-error dynamic method call
      await klapi[method](params)
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining(path), expect.any(Object))
    })
  })

  describe('get error handling', () => {
    it('should handle fetch error', async () => {
      ;(fetch as jest.Mock<any>).mockRejectedValueOnce(new Error('Network error'))
      const result = await klapi.lueKennelpiirit()
      expect(result.status).toBe(204) // default status
      expect(result.error).toBe('Network error')
    })

    it('should handle non-ok response', async () => {
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      })
      const result = await klapi.lueKennelpiirit()
      expect(result.status).toBe(500)
      expect(result.error).toBe('Server error')
    })

    it('should handle json parsing error', async () => {
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON')
        },
      })
      const result = await klapi.lueKennelpiirit()
      expect(result.status).toBe(200)
      expect(result.json).toBeUndefined()
    })
  })
})
