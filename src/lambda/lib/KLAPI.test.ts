import type { KLAPIConfig } from '../types/KLAPI'
import { jest } from '@jest/globals'
import { KLKieli } from '../types/KLAPI'
import KLAPI from './KLAPI'

const mockConfig: KLAPIConfig = {
  KL_API_PWD: 'testpassword',
  KL_API_UID: 'testuser',
  KL_API_URL: 'https://api.koiraklubi.fi',
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
      const mockDog = { kuollut: false, nimi: 'Testikoira', rekisterinumero: 'FI12345/21', rotu: 'Testirotu' }
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({
        json: async () => mockDog,
        ok: true,
        status: 200,
      })

      const result = await klapi.lueKoiranPerustiedot({ Kieli: KLKieli.Suomi, Rekisterinumero: 'FI12345/21' })

      expect(result.json).toEqual(mockDog)
      expect(result.status).toBe(200)
    })

    it('should return 404 if rekisterinumero is missing from response', async () => {
      const mockDog = { nimi: 'Testikoira', rotu: 'Testirotu' }
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({
        json: async () => mockDog,
        ok: true,
        status: 200,
      })

      const result = await klapi.lueKoiranPerustiedot({ Kieli: KLKieli.Suomi, Rekisterinumero: 'FI12345/21' })

      expect(result.status).toBe(404)
      expect(result.error).toBe('not found')
    })

    it('should return 404 if dog is deceased', async () => {
      const mockDog = { kuollut: true, nimi: 'Testikoira', rekisterinumero: 'FI12345/21', rotu: 'Testirotu' }
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({
        json: async () => mockDog,
        ok: true,
        status: 200,
      })

      const result = await klapi.lueKoiranPerustiedot({ Kieli: KLKieli.Suomi, Rekisterinumero: 'FI12345/21' })

      expect(result.status).toBe(404)
      expect(result.error).toBe('diseased')
    })

    it('should return 404 if no regNo or chip is provided', async () => {
      const result = await klapi.lueKoiranPerustiedot({ Kieli: KLKieli.Suomi })
      expect(result.status).toBe(404)
    })

    it('should filter out undefined params', async () => {
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({
        json: async () => ({ rekisterinumero: 'FI12345/21' }),
        ok: true,
        status: 200,
      })
      await klapi.lueKoiranPerustiedot({
        Kieli: KLKieli.Suomi,
        Rekisterinumero: 'FI12345/21',
        Tunnistusmerkintä: undefined,
      })
      expect(fetch).toHaveBeenCalledWith(
        'https://api.koiraklubi.fi/Koira/Lue/Perustiedot?Kieli=1&Rekisterinumero=FI12345%2F21',
        expect.any(Object)
      )
    })
  })

  describe('lueKoiranKoetulokset', () => {
    it('should return 404 if no regNo is provided', async () => {
      const result = await klapi.lueKoiranKoetulokset({ Kieli: KLKieli.Suomi, Rekisterinumero: '' })
      expect(result.status).toBe(404)
    })

    it('should call get with correct params', async () => {
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({ json: async () => [], ok: true, status: 200 })
      await klapi.lueKoiranKoetulokset({ Kieli: KLKieli.Suomi, Rekisterinumero: 'FI12345/21' })
      expect(fetch).toHaveBeenCalledWith(
        'https://api.koiraklubi.fi/Koira/Lue/Koetulokset?Kieli=1&Rekisterinumero=FI12345%2F21',
        expect.any(Object)
      )
    })
  })

  describe('generic GET methods', () => {
    const testCases = [
      {
        expectedParams: 'Kieli=1',
        method: 'lueKoemuodot' as const,
        params: { Kieli: KLKieli.Suomi },
        path: 'Koemuoto/Lue/Koemuodot',
      },
      {
        expectedParams: 'Koemuoto=NOME-B&Kieli=1',
        method: 'lueKoetulokset' as const,
        params: { Kieli: KLKieli.Suomi, Koemuoto: 'NOME-B' },
        path: 'Koemuoto/Lue/Tulokset',
      },
      {
        expectedParams: 'Koemuoto=NOME-B&Kieli=1',
        method: 'lueKoemuodonTarkenteet' as const,
        params: { Kieli: KLKieli.Suomi, Koemuoto: 'NOME-B' },
        path: 'Koemuoto/Lue/Tarkenteet',
      },
      {
        expectedParams: 'Koemuoto=NOME-B&Kieli=1',
        method: 'lueKoemuodonYlituomarit' as const,
        params: { Kieli: KLKieli.Suomi, Koemuoto: 'NOME-B' },
        path: 'Koemuoto/Lue/Ylituomarit',
      },
      {
        expectedParams: 'Koemuoto=NOME-B&Kieli=1',
        method: 'lueKoemuodonKoetoimitsijat' as const,
        params: { Kieli: KLKieli.Suomi, Koemuoto: 'NOME-B' },
        path: 'Koemuoto/Lue/Koetoimitsijat',
      },
      {
        expectedParams: 'Koemuoto=NOME-B&Kieli=1',
        method: 'lueKoetapahtumat' as const,
        params: { Kieli: KLKieli.Suomi, Koemuoto: 'NOME-B' },
        path: 'Koe/Lue/Koetapahtumat',
      },
      { expectedParams: '', method: 'lueKennelpiirit' as const, params: {}, path: 'Yleista/Lue/Kennelpiirit' },
      {
        expectedParams: 'KennelpiirinNumero=1',
        method: 'luePaikkakunnat' as const,
        params: { KennelpiirinNumero: 1 },
        path: 'Yleista/Lue/Paikkakunnat',
      },
      {
        expectedParams: 'Kieli=1',
        method: 'lueYhdistykset' as const,
        params: { Kieli: KLKieli.Suomi },
        path: 'Yleista/Lue/Yhdistykset',
      },
      {
        expectedParams: 'Nimi=test&Kieli=1',
        method: 'lueParametrit' as const,
        params: { Kieli: KLKieli.Suomi, Nimi: 'test' },
        path: 'Yleista/Lue/Parametrit',
      },
      {
        expectedParams: 'Kieli=1',
        method: 'lueRoturyhmät' as const,
        params: { Kieli: KLKieli.Suomi },
        path: 'Yleista/Lue/Roturyhmat',
      },
      {
        expectedParams: 'Kieli=1',
        method: 'lueRodut' as const,
        params: { Kieli: KLKieli.Suomi },
        path: 'Yleista/Lue/Rodut',
      },
    ]

    it.each(testCases)('should call get with correct path for $method', async ({ method, path, params }) => {
      ;(fetch as jest.Mock<any>).mockResolvedValueOnce({ json: async () => [], ok: true, status: 200 })
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
        json: async () => {
          throw new Error('Invalid JSON')
        },
        ok: true,
        status: 200,
      })
      const result = await klapi.lueKennelpiirit()
      expect(result.status).toBe(200)
      expect(result.json).toBeUndefined()
    })
  })
})
