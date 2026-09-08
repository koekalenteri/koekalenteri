import type { KLAPIConfig } from '../types/KLAPI'
import { vi } from 'vitest'
import { KLKieli } from '../types/KLAPI'
import KLAPI from './KLAPI'

const mockConfig: KLAPIConfig = {
  KL_API_PWD: 'testpassword',
  KL_API_UID: 'testuser',
  KL_API_URL: 'https://api.koiraklubi.fi',
}

const mockLoadConfig = vi.fn(async () => mockConfig)

const originalFetch = global.fetch
global.fetch = vi.fn<typeof fetch>()

const mockFetch = vi.mocked(fetch)
/** The doubles here are partial Responses: the client reads only ok, status, statusText, json and text. */
const respondOnce = (response: Partial<Response>) => mockFetch.mockResolvedValueOnce(response as Response)

describe('KLAPI', () => {
  let klapi: KLAPI

  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  beforeEach(() => {
    klapi = new KLAPI(mockLoadConfig)
    vi.clearAllMocks()
  })

  describe('lueKoiranPerustiedot', () => {
    it('should return dog data on successful fetch', async () => {
      const mockDog = { kuollut: false, nimi: 'Testikoira', rekisterinumero: 'FI12345/21', rotu: 'Testirotu' }
      respondOnce({
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
      respondOnce({
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
      respondOnce({
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
      respondOnce({
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
      respondOnce({ json: async () => [], ok: true, status: 200 })
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
      respondOnce({ json: async () => [], ok: true, status: 200 })
      // @ts-expect-error dynamic method call
      await klapi[method](params)
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining(path), expect.any(Object))
    })
  })

  describe('lueKoetapahtumat', () => {
    // KL sends these fields under two names each and picks per event; two of the alternatives are
    // its own typos. The client collapses them so nothing downstream has to know.
    it('collapses the alternative field names KL sends', async () => {
      const wire = {
        aika: '2026-07-01',
        id: 222,
        ilmoitauttumisLinkki: 'https://koekalenteri.snj.fi/',
        ilmoittautumisenAlku: '2026-05-17T00:00:00',
        ilmoittautumisenLoppu: '2026-06-07T00:00:00',
        lisatiedot: 'Ilmoittautuminen sähköpostitse.',
        luokat: ['ALO'],
        osanottomaksu: '45,00',
        rajoitukset: [{ lisätiedot: 'SM järjestämisohje', rajoituksenTyyppi: 'Muu määrää koskeva rajoitus' }],
        tininumero: 'FI86 1281 3000 2014 69',
      }
      respondOnce({
        json: async () => [wire],
        ok: true,
        status: 200,
      })

      const { json } = await klapi.lueKoetapahtumat({ Alku: '2026-07-01', Kieli: KLKieli.Suomi, Loppu: '2026-07-02' })

      expect(json?.[0]).toEqual({
        aika: '2026-07-01',
        id: 222,
        ilmoittautuminenAlkaa: '2026-05-17T00:00:00',
        ilmoittautuminenPäättyy: '2026-06-07T00:00:00',
        ilmoittautumisLinkki: 'https://koekalenteri.snj.fi/',
        lisätiedot: 'Ilmoittautuminen sähköpostitse.',
        luokat: ['ALO'],
        osallistumismaksu: '45,00',
        rajoitukset: [{ lisätieto: 'SM järjestämisohje', tyyppi: 'Muu määrää koskeva rajoitus' }],
        tilinumero: 'FI86 1281 3000 2014 69',
      })
    })

    it('keeps the canonical names when KL sends those', async () => {
      const wire = {
        ilmoittautuminenAlkaa: '2026-05-17T00:00:00',
        ilmoittautuminenPäättyy: '2026-06-07T00:00:00',
        ilmoittautumisLinkki: 'https://koekalenteri.snj.fi/',
        lisätiedot: 'Osallistumismaksu sisältää keittolounaan.',
        osallistumismaksu: 55,
        rajoitukset: [{ lisätieto: 'SM järjestämisohje', tyyppi: 'Muu määrää koskeva rajoitus' }],
        tilinumero: 'FI86 1281 3000 2014 69',
      }
      respondOnce({
        json: async () => [wire],
        ok: true,
        status: 200,
      })

      const { json } = await klapi.lueKoetapahtumat({ Alku: '2026-07-01', Kieli: KLKieli.Suomi, Loppu: '2026-07-02' })

      expect(json?.[0]).toEqual(wire)
    })

    it('leaves an error response alone', async () => {
      respondOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Ei tulosta',
      })

      const result = await klapi.lueKoetapahtumat({ Alku: '2026-07-01', Kieli: KLKieli.Suomi, Loppu: '2026-07-02' })

      expect(result).toEqual({ error: 'Ei tulosta', json: undefined, status: 404 })
    })
  })

  describe('get error handling', () => {
    it('should handle fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      const result = await klapi.lueKennelpiirit()
      expect(result.status).toBe(204) // default status
      expect(result.error).toBe('Network error')
    })

    it('should handle non-ok response', async () => {
      respondOnce({
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
      respondOnce({
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
