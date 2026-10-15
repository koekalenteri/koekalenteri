import type { KLIntegraatioConfig, KLIntKoemuoto } from '../types/KLIntegraatio'
import { vi } from 'vitest'
import { KL_TILA_YLITUOMARIN_HYVÄKSYTTÄVÄKSI } from '../types/KLIntegraatio'
import KLIntegraatio from './KLIntegraatio'
import koemuotoNKM from './KLIntegraatio-fixtures/koemuoto-NKM.json'
import koemuotoNOME_A from './KLIntegraatio-fixtures/koemuoto-NOME-A.json'
import koemuotoNOME_B from './KLIntegraatio-fixtures/koemuoto-NOME-B.json'
import koemuotoNOU from './KLIntegraatio-fixtures/koemuoto-NOU.json'
import koemuotoNOWT from './KLIntegraatio-fixtures/koemuoto-NOWT.json'
import kokeetNOU from './KLIntegraatio-fixtures/kokeet-NOU.json'
import lueNOU from './KLIntegraatio-fixtures/lue-NOU.json'

const config: KLIntegraatioConfig = {
  KL_API_PWD: 'secret-pwd',
  KL_API_UID: 'snj-uid',
  KL_INT_API_URL: 'https://rajapinta.example.test/KennelliittoAPI_JulkinenTesti2/',
  KL_INT_SSO_URL: 'https://sso.example.test/connect/token',
}
const loadConfig = vi.fn(async () => config)

type Request = { body?: string; headers: Record<string, string>; method: string; url: string }

/** What the fake KL does with the next request. */
type Reply = { body?: unknown; status?: number }

const tokenReply = (expiresIn: number, token = 'token-1'): Reply => ({
  body: { access_token: token, expires_in: expiresIn, token_type: 'Bearer' },
})

describe('KLIntegraatio', () => {
  let requests: Request[]
  let replies: Reply[]
  let nowMs: number
  let klint: KLIntegraatio

  const fakeFetch = async (input: string | URL | Request | globalThis.Request, init?: RequestInit) => {
    const headers: Record<string, string> = {}
    new Headers(init?.headers).forEach((value, key) => {
      headers[key] = value
    })
    requests.push({
      body: typeof init?.body === 'string' ? init.body : init?.body?.toString(),
      headers,
      method: init?.method ?? 'GET',
      url: String(input),
    })
    const reply = replies.shift()
    if (!reply) throw new Error(`unexpected request to ${String(input)}`)
    const text = reply.body === undefined ? '' : JSON.stringify(reply.body)
    return new Response(text, { status: reply.status ?? 200 })
  }

  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  beforeEach(() => {
    requests = []
    replies = []
    nowMs = 1_000_000
    vi.stubGlobal('fetch', fakeFetch)
    klint = new KLIntegraatio(loadConfig, { now: () => nowMs })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  describe('token', () => {
    it('asks the SSO address for a client_credentials token with scope kennelapi', async () => {
      replies.push(tokenReply(3600), { body: koemuotoNOU })

      await klint.lueKoemuoto({ koemuoto: 'NOU' })

      const [tokenRequest] = requests
      expect(tokenRequest.url).toBe(config.KL_INT_SSO_URL)
      expect(tokenRequest.method).toBe('POST')
      expect(tokenRequest.headers['content-type']).toBe('application/x-www-form-urlencoded')
      expect(Object.fromEntries(new URLSearchParams(tokenRequest.body))).toEqual({
        client_id: 'snj-uid',
        client_secret: 'secret-pwd',
        grant_type: 'client_credentials',
        scope: 'kennelapi',
      })
    })

    it('sends the token as a bearer header', async () => {
      replies.push(tokenReply(3600, 'abc'), { body: koemuotoNOU })

      await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(requests[1].headers.authorization).toBe('Bearer abc')
    })

    it.each([1799, 3600])('keeps a token of expires_in %i until a minute before it runs out', async (expiresIn) => {
      replies.push(
        tokenReply(expiresIn),
        { body: koemuotoNOU },
        { body: koemuotoNOU },
        tokenReply(expiresIn, 'token-2'),
        {
          body: koemuotoNOU,
        }
      )

      await klint.lueKoemuoto({ koemuoto: 'NOU' })
      nowMs += (expiresIn - 61) * 1000
      await klint.lueKoemuoto({ koemuoto: 'NOU' })
      nowMs += 2000
      await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(requests.map((r) => r.url === config.KL_INT_SSO_URL)).toEqual([true, false, false, true, false])
      expect(requests[4].headers.authorization).toBe('Bearer token-2')
    })

    it('shares one token request between concurrent calls', async () => {
      replies.push(tokenReply(3600), { body: koemuotoNOU }, { body: koemuotoNOU })

      await Promise.all([klint.lueKoemuoto({ koemuoto: 'NOU' }), klint.lueKoemuoto({ koemuoto: 'NOU' })])

      expect(requests.filter((r) => r.url === config.KL_INT_SSO_URL)).toHaveLength(1)
    })

    it('returns the status when the token request is refused', async () => {
      replies.push({ body: { error: 'invalid_client' }, status: 400 })

      const result = await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(result.status).toBe(400)
      expect(result.json).toBeUndefined()
      expect(requests).toHaveLength(1)
    })

    it('forgets a failed token request, so the next call tries again', async () => {
      replies.push({ status: 500 }, tokenReply(3600), { body: koemuotoNOU })

      const failed = await klint.lueKoemuoto({ koemuoto: 'NOU' })
      const ok = await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(failed.status).toBe(500)
      expect(ok.status).toBe(200)
    })
  })

  describe('token response', () => {
    it('refuses a 200 that carries no usable token', async () => {
      replies.push({ body: { access_token: 'x' } })

      const result = await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(result).toEqual({ error: 'Token response is not valid', status: 200 })
      expect(requests).toHaveLength(1)
    })
  })

  describe('401', () => {
    it('fetches a new token once and repeats the call', async () => {
      replies.push(tokenReply(3600), { status: 401 }, tokenReply(3600, 'token-2'), { body: koemuotoNOU })

      const result = await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(result.status).toBe(200)
      expect(result.json?.koemuoto).toBe('NOU')
      expect(requests.map((r) => r.headers.authorization)).toEqual([
        undefined,
        'Bearer token-1',
        undefined,
        'Bearer token-2',
      ])
    })

    it('returns the status of a token refresh that fails and sends no second call', async () => {
      replies.push(tokenReply(3600), { status: 401 }, { status: 500 })

      const result = await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(result).toEqual({ status: 500 })
      expect(requests).toHaveLength(3)
    })

    it('gives up after the second 401', async () => {
      replies.push(tokenReply(3600), { status: 401 }, tokenReply(3600, 'token-2'), { status: 401 })

      const result = await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(result.status).toBe(401)
      expect(requests).toHaveLength(4)
    })
  })

  describe('virheet', () => {
    it('returns the reasons of a 400', async () => {
      replies.push(tokenReply(3600), {
        body: { virheet: ['Koemuoto puuttuu.', 'Virheellinen päivämääräväli.'] },
        status: 400,
      })

      const result = await klint.lueKokeet({ alku: '2026-01-01', koemuoto: '', loppu: '2026-12-31' })

      expect(result.status).toBe(400)
      expect(result.virheet).toEqual(['Koemuoto puuttuu.', 'Virheellinen päivämääräväli.'])
      expect(result.json).toBeUndefined()
    })

    it('returns the reasons of a 404', async () => {
      replies.push(tokenReply(3600), { body: { virheet: ['Koetta ei löytynyt.'] }, status: 404 })

      const result = await klint.lueKoe({ koeGuid: 'x' })

      expect(result.status).toBe(404)
      expect(result.virheet).toEqual(['Koetta ei löytynyt.'])
    })

    it('returns a 404 without a body as a plain status', async () => {
      replies.push(tokenReply(3600), { status: 404 })

      const result = await klint.lueKoemuoto({ koemuoto: 'XXX' })

      expect(result).toEqual({ status: 404 })
    })

    it('does not mistake a body without virheet for reasons', async () => {
      replies.push(tokenReply(3600), { body: { viesti: 'jotain' }, status: 400 })

      const result = await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(result).toEqual({ status: 400 })
    })
  })

  describe('lueKoemuoto', () => {
    it('asks Integraatio/Koe/Koemuoto with the koemuoto parameter', async () => {
      replies.push(tokenReply(3600), { body: koemuotoNOWT })

      await klint.lueKoemuoto({ koemuoto: 'NOME-A' })

      expect(requests[1].method).toBe('GET')
      expect(requests[1].url).toBe(`${config.KL_INT_API_URL}Integraatio/Koe/Koemuoto?koemuoto=NOME-A`)
    })

    it('joins the address with or without a trailing slash', async () => {
      klint = new KLIntegraatio(async () => ({ ...config, KL_INT_API_URL: 'https://rajapinta.example.test/API' }), {
        now: () => nowMs,
      })
      replies.push(tokenReply(3600), { body: koemuotoNOU })

      await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(requests[1].url).toBe('https://rajapinta.example.test/API/Integraatio/Koe/Koemuoto?koemuoto=NOU')
    })

    it.each<[string, KLIntKoemuoto, string[], number]>([
      ['NOWT', koemuotoNOWT, ['ALO', 'AVO', 'VOI'], 20],
      ['NOME-A', koemuotoNOME_A, [], 11],
      ['NOME-B', koemuotoNOME_B, ['ALO', 'AVO', 'VOI'], 17],
      ['NOU', koemuotoNOU, [], 2],
      ['NKM', koemuotoNKM, [], 3],
    ])('returns the real %s response', async (code, fixture, luokat, resultCount) => {
      replies.push(tokenReply(3600), { body: fixture })

      const result = await klint.lueKoemuoto({ koemuoto: code })

      expect(result.status).toBe(200)
      expect(result.json).toEqual(fixture)
      expect(result.json?.koemuoto).toBe(code)
      expect(result.json?.luokat).toEqual(luokat)
      expect(result.json?.tulokset).toHaveLength(resultCount)
    })

    it('carries the flags NOWT needs to map a result string', async () => {
      replies.push(tokenReply(3600), { body: koemuotoNOWT })

      const result = await klint.lueKoemuoto({ koemuoto: 'NOWT' })

      const tulokset = new Map(result.json?.tulokset.map((t) => [t.tulos, t]))
      expect(tulokset.get('sert')).toMatchObject({ hylätty: false, keskeytys: false })
      expect(tulokset.get('vara sert')).toMatchObject({ hylätty: false, keskeytys: false })
    })

    it('tells NKM its interrupted and rejected results apart', async () => {
      replies.push(tokenReply(3600), { body: koemuotoNKM })

      const result = await klint.lueKoemuoto({ koemuoto: 'NKM' })

      const tulokset = new Map(result.json?.tulokset.map((t) => [t.tulos, t]))
      expect(tulokset.get('NKM0')).toMatchObject({ hylätty: true, keskeytys: false })
      expect(tulokset.get('NKM-')).toMatchObject({ hylätty: false, keskeytys: true })
      expect(result.json?.tarkenteet).toEqual(['Kokokauden koe'])
    })

    it('lists the riistakoe and damikoe tarkenteet of NOME-B', async () => {
      replies.push(tokenReply(3600), { body: koemuotoNOME_B })

      const result = await klint.lueKoemuoto({ koemuoto: 'NOME-B' })

      expect(result.json?.tarkenteet).toEqual(['damikoe', 'riistakoe'])
    })
  })

  describe('lueKokeet', () => {
    it('sends the date range as alku and loppu in yyyy-MM-dd', async () => {
      replies.push(tokenReply(3600), { body: kokeetNOU })

      await klint.lueKokeet({ alku: '2026-01-01', koemuoto: 'NOU', loppu: '2026-12-31' })

      expect(requests[1].url).toBe(
        `${config.KL_INT_API_URL}Integraatio/Koe/Kokeet?alku=2026-01-01&koemuoto=NOU&loppu=2026-12-31`
      )
    })

    it('accepts a trial without a koeGUID and names the state tilanNimi', async () => {
      replies.push(tokenReply(3600), { body: kokeetNOU })

      const result = await klint.lueKokeet({ alku: '2026-01-01', koemuoto: 'NOU', loppu: '2026-12-31' })

      expect(result.json?.map((k) => k.koeGUID)).toEqual([null, '2b81e6a1-559b-407c-87c7-b8a9b89b1987'])
      expect(result.json?.map((k) => k.tilanNimi)).toEqual(['Valmistunut', 'Hyväksytty'])
    })
  })

  describe('lueKoe', () => {
    it('asks Koe/Lue with koeGuid and names the state tilaNimi', async () => {
      replies.push(tokenReply(3600), { body: lueNOU })

      const result = await klint.lueKoe({ koeGuid: lueNOU.koeGUID })

      expect(requests[1].url).toBe(`${config.KL_INT_API_URL}Integraatio/Koe/Lue?koeGuid=${lueNOU.koeGUID}`)
      expect(result.json?.tilaNimi).toBe('Hyväksytty')
      expect(result.json?.tapahtumatyyppi).toBe(410)
      expect(result.json?.henkilöstö[2].jäsennumero).toBeNull()
    })
  })

  describe('lueKoe by koeTunnus', () => {
    it('leaves the unused koeGuid out of the query', async () => {
      replies.push(tokenReply(3600), { body: lueNOU })

      await klint.lueKoe({ koeTunnus: 'T1' })

      expect(requests[1].url).toBe(`${config.KL_INT_API_URL}Integraatio/Koe/Lue?koeTunnus=T1`)
    })
  })

  describe('lueKoira', () => {
    it.each([
      [{ rekisterinumero: 'FI12345/21' }, 'rekisterinumero=FI12345%2F21'],
      [{ tunnistusmerkinta: '123456789012345' }, 'tunnistusmerkinta=123456789012345'],
      [{ nimi: 'Testi Koira' }, 'nimi=Testi+Koira'],
      [{ id: 42 }, 'id=42'],
    ])('sends only %o', async (params, query) => {
      replies.push(tokenReply(3600), { body: { nimi: 'Testi Koira' } })

      await klint.lueKoira(params)

      expect(requests[1].url).toBe(`${config.KL_INT_API_URL}Integraatio/Koira?${query}`)
    })
  })

  describe('write calls', () => {
    const tulos = {
      hylätty: false,
      keskeytetty: false,
      koeGUID: 'guid-1',
      nimi: 'Testi Koira',
      palkintotuomarit: [],
      pisteet: 80,
      päivä: '2026-09-26',
      rekisterinumero: 'FI12345/21',
      tulos: 'ALO1',
      tuomarit: [1000001],
    }

    it('Tulos/Tallenna posts the body as JSON and returns the TulosId', async () => {
      replies.push(tokenReply(3600), { body: { TulosId: 77 } })

      const result = await klint.tallennaTulos(tulos)

      expect(requests[1].method).toBe('POST')
      expect(requests[1].url).toBe(`${config.KL_INT_API_URL}Integraatio/Koe/Tulos/Tallenna`)
      expect(requests[1].headers['content-type']).toBe('application/json')
      expect(JSON.parse(requests[1].body ?? '')).toEqual(tulos)
      expect(result.json).toEqual({ TulosId: 77 })
    })

    it('Tulos/Tallenna returns the reasons when KL refuses the result', async () => {
      replies.push(tokenReply(3600), { body: { virheet: ['Koira puuttuu.'] }, status: 400 })

      const result = await klint.tallennaTulos(tulos)

      expect(result).toEqual({ status: 400, virheet: ['Koira puuttuu.'] })
    })

    it('Tulos/Tallenna repeats once after a 401', async () => {
      replies.push(tokenReply(3600), { status: 401 }, tokenReply(3600, 'token-2'), { body: { TulosId: 5 } })

      const result = await klint.tallennaTulos(tulos)

      expect(result.json).toEqual({ TulosId: 5 })
      expect(requests[3].body).toBe(requests[1].body)
    })

    it('Tulos/Poista posts the body as JSON', async () => {
      replies.push(tokenReply(3600), { status: 200 })
      const poisto = { koeGUID: 'guid-1', päivä: '2026-09-26', rekisterinumero: 'FI12345/21' }

      const result = await klint.poistaTulos(poisto)

      expect(requests[1].method).toBe('POST')
      expect(requests[1].url).toBe(`${config.KL_INT_API_URL}Integraatio/Koe/Tulos/Poista`)
      expect(JSON.parse(requests[1].body ?? '')).toEqual(poisto)
      expect(result.status).toBe(200)
    })

    it('Koe/AsetaTila posts the state, 1253 hands the trial to the chief judge', async () => {
      replies.push(tokenReply(3600), { status: 200 })

      await klint.asetaTila({ koeGUID: 'guid-1', tila: KL_TILA_YLITUOMARIN_HYVÄKSYTTÄVÄKSI })

      expect(requests[1].method).toBe('POST')
      expect(requests[1].url).toBe(`${config.KL_INT_API_URL}Integraatio/Koe/AsetaTila`)
      expect(JSON.parse(requests[1].body ?? '')).toEqual({ koeGUID: 'guid-1', tila: 1253 })
    })
  })

  describe('failures', () => {
    it('reports a network error as error text instead of throwing', async () => {
      vi.stubGlobal('fetch', async () => {
        throw new Error('connection reset')
      })

      const result = await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(result).toEqual({ error: 'connection reset', status: 0 })
    })

    it('reports a data call that rejects after a good token', async () => {
      const first = fakeFetch
      let calls = 0
      vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
        calls++
        if (calls === 1) {
          replies.push(tokenReply(3600))
          return first(input, init)
        }
        throw new Error('socket hang up')
      })

      const result = await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(result).toEqual({ error: 'socket hang up', status: 0 })
    })

    it('names an unknown thrown value', async () => {
      vi.stubGlobal('fetch', async () => {
        throw 'plain string'
      })

      const result = await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(result).toEqual({ error: 'unknown error', status: 0 })
    })

    it('returns only the status when an error body is not JSON', async () => {
      const first = fakeFetch
      let calls = 0
      vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
        calls++
        if (calls === 1) {
          replies.push(tokenReply(3600))
          return first(input, init)
        }
        return new Response('<html>bad gateway</html>', { status: 502 })
      })

      const result = await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(result).toEqual({ status: 502 })
    })

    it('reports a body that is not JSON', async () => {
      replies.push(tokenReply(3600))
      const first = fakeFetch
      let calls = 0
      vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
        calls++
        if (calls === 1) return first(input, init)
        return new Response('<html>oops</html>', { status: 200 })
      })

      const result = await klint.lueKoemuoto({ koemuoto: 'NOU' })

      expect(result.status).toBe(200)
      expect(result.json).toBeUndefined()
      expect(result.error).toBeDefined()
    })
  })
})
