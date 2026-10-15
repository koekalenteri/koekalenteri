import type {
  KLIntAsetaTila,
  KLIntegraatioConfig,
  KLIntegraatioResult,
  KLIntegraatioToken,
  KLIntKoe,
  KLIntKoeListassa,
  KLIntKoeLueParametrit,
  KLIntKoemuoto,
  KLIntKoemuotoParametrit,
  KLIntKoira,
  KLIntKoiraParametrit,
  KLIntKokeetParametrit,
  KLIntTulosPoista,
  KLIntTulosTallenna,
  KLIntTulosTallennaVastaus,
} from '../types/KLIntegraatio'
import { logger } from './log'

type Query = Record<string, string | number | undefined>

type Options = {
  /** The clock, in milliseconds. Injected so that token expiry is testable without fake timers. */
  now?: () => number
}

type TokenOutcome = { failure?: undefined; token: string } | { failure: KLIntegraatioResult<never>; token?: undefined }

type Parsed<T> = { error?: string; json?: T; virheet?: string[] }

/** The token is dropped this long before KL says it expires, so a call never starts with a dying token. */
const TOKEN_MARGIN_S = 60

/** The API's paths all start with this, while the configured address ends where the API ends. */
const PATH_PREFIX = 'Integraatio'

const SCOPE = 'kennelapi'

const toSearchParams = (query: Query): URLSearchParams => {
  const sp = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) sp.set(key, String(value))
  }
  return sp
}

const trimTrailingSlashes = (value: string): string => {
  let end = value.length
  while (end > 0 && value[end - 1] === '/') end--
  return value.slice(0, end)
}

const joinUrl = (base: string, path: string, query: Query = {}): string => {
  const sp = toSearchParams(query).toString()
  const url = `${trimTrailingSlashes(base)}/${PATH_PREFIX}/${path}`
  return sp ? `${url}?${sp}` : url
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const getVirheet = (value: unknown): string[] | undefined => {
  if (typeof value !== 'object' || value === null || !('virheet' in value)) return undefined
  return isStringArray(value.virheet) ? value.virheet : undefined
}

const isToken = (value: unknown): value is KLIntegraatioToken =>
  typeof value === 'object' &&
  value !== null &&
  'access_token' in value &&
  typeof value.access_token === 'string' &&
  'expires_in' in value &&
  typeof value.expires_in === 'number'

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : 'unknown error')

/**
 * Client for Kennelliitto's Integraatio API: OAuth client_credentials instead of the header
 * credentials of {@link KLAPI}, and every path under `Integraatio/`.
 *
 * Nothing here throws on a bad answer. A failed call returns its status, and the reasons KL gave
 * (`{ "virheet": [...] }` on 400 and 404) are logged and returned, so the caller decides what the
 * secretary is told.
 */
export default class KLIntegraatio {
  private _config?: KLIntegraatioConfig
  private readonly _loadConfig: () => Promise<KLIntegraatioConfig>
  private readonly _now: () => number
  private _token?: { expiresAt: number; token: string }
  private _tokenRequest?: Promise<TokenOutcome>

  public constructor(loadConfig: () => Promise<KLIntegraatioConfig>, { now = Date.now }: Options = {}) {
    this._loadConfig = loadConfig
    this._now = now
  }

  private async _getConfig(): Promise<KLIntegraatioConfig> {
    this._config ??= await this._loadConfig()
    return this._config
  }

  private async _fetchToken(cfg: KLIntegraatioConfig): Promise<TokenOutcome> {
    try {
      const res = await fetch(cfg.KL_INT_SSO_URL, {
        body: new URLSearchParams({
          client_id: cfg.KL_API_UID,
          client_secret: cfg.KL_API_PWD,
          grant_type: 'client_credentials',
          scope: SCOPE,
        }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST',
      })
      if (!res.ok) {
        logger.error('KLIntegraatio token request was not ok', { status: res.status })
        return { failure: { status: res.status } }
      }
      const body: unknown = await res.json()
      if (!isToken(body)) {
        logger.error('KLIntegraatio token response has no access_token and expires_in')
        return { failure: { error: 'Token response is not valid', status: res.status } }
      }
      const { access_token, expires_in } = body
      this._token = { expiresAt: this._now() + (expires_in - TOKEN_MARGIN_S) * 1000, token: access_token }
      return { token: access_token }
    } catch (e) {
      logger.error('KLIntegraatio token request failed', { error: e })
      return { failure: { error: errorMessage(e), status: 0 } }
    }
  }

  private async _getToken(cfg: KLIntegraatioConfig): Promise<TokenOutcome> {
    if (this._token && this._token.expiresAt > this._now()) return { token: this._token.token }
    // Concurrent calls wait for the same request. The request is forgotten when it ends, so a failure is retried.
    this._tokenRequest ??= this._fetchToken(cfg).finally(() => {
      this._tokenRequest = undefined
    })
    return this._tokenRequest
  }

  private async _send(token: string, method: string, url: string, body?: object) {
    return fetch(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      method,
    })
  }

  private async _read<T>(res: Response, path: string): Promise<Parsed<T>> {
    const text = await res.text()
    if (!text) return {}
    let parsed: T
    try {
      parsed = JSON.parse(text)
    } catch {
      logger.error('KLIntegraatio response is not JSON', { path, status: res.status })
      return res.ok ? { error: 'Response is not JSON' } : {}
    }
    if (res.ok) {
      return { json: parsed }
    }
    const virheet = getVirheet(parsed)
    if (virheet) logger.error('KLIntegraatio refused the request', { path, status: res.status, virheet })
    return virheet ? { virheet } : {}
  }

  private async request<T>(
    method: string,
    path: string,
    query?: Query,
    body?: object
  ): Promise<KLIntegraatioResult<T>> {
    const cfg = await this._getConfig()
    const url = joinUrl(cfg.KL_INT_API_URL, path, query)
    logger.info('KLIntegraatio request', { method, path })
    try {
      let outcome = await this._getToken(cfg)
      if (outcome.failure) return outcome.failure
      let res = await this._send(outcome.token, method, url, body)
      if (res.status === 401) {
        // The token may have been revoked before it expired: ask for a new one, once.
        this._token = undefined
        outcome = await this._getToken(cfg)
        if (outcome.failure) return outcome.failure
        res = await this._send(outcome.token, method, url, body)
      }
      return { status: res.status, ...(await this._read<T>(res, path)) }
    } catch (e) {
      logger.error('KLIntegraatio request failed', { error: e, path })
      return { error: errorMessage(e), status: 0 }
    }
  }

  lueKoemuoto(params: KLIntKoemuotoParametrit) {
    return this.request<KLIntKoemuoto>('GET', 'Koe/Koemuoto', params)
  }

  lueKokeet(params: KLIntKokeetParametrit) {
    return this.request<KLIntKoeListassa[]>('GET', 'Koe/Kokeet', params)
  }

  lueKoe(params: KLIntKoeLueParametrit) {
    return this.request<KLIntKoe>('GET', 'Koe/Lue', params)
  }

  lueKoira(params: KLIntKoiraParametrit) {
    return this.request<KLIntKoira>('GET', 'Koira', params)
  }

  /** Saves one dog's result. Saving again for the same dog updates the earlier result. */
  tallennaTulos(tulos: KLIntTulosTallenna) {
    return this.request<KLIntTulosTallennaVastaus>('POST', 'Koe/Tulos/Tallenna', undefined, tulos)
  }

  poistaTulos(tulos: KLIntTulosPoista) {
    return this.request<never>('POST', 'Koe/Tulos/Poista', undefined, tulos)
  }

  asetaTila(tila: KLIntAsetaTila) {
    return this.request<never>('POST', 'Koe/AsetaTila', undefined, tila)
  }
}
