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
import { getKLIntegraatioConfig } from './secrets'

type Query = Record<string, string | number | undefined>

type Options = {
  /** The clock, in milliseconds. Injected so that token expiry is testable without fake timers. */
  now?: () => number
  /** How long one call to KL may take before it is given up as unanswered. */
  timeoutMs?: number
}

/** What a caller may ask of one call: to be given up when the caller's own time is used up. */
type CallOptions = {
  signal?: AbortSignal
}

type TokenOutcome = { failure?: undefined; token: string } | { failure: KLIntegraatioResult<never>; token?: undefined }

type Parsed<T> = { error?: string; json?: T; virheet?: string[] }

/** The token is dropped this long before KL says it expires, so a call never starts with a dying token. */
const TOKEN_MARGIN_S = 60

/** The API's paths all start with this, while the configured address ends where the API ends. */
const PATH_PREFIX = 'Integraatio'

const SCOPE = 'kennelapi'

/**
 * One call's time limit. The reads of Testi2 took 0.1 to 0.3 s warm and 2.7 s at the very first call of
 * a cold session, the token 5.7 s once (15.10.2026), and a request through the API gateway has 29 s in
 * all. Eight seconds is ten times the warm read and three times the worst cold one: a call that takes
 * longer has hung, and waiting for it would use up the answer the secretary is waiting for.
 */
const CALL_TIMEOUT_MS = 8000

/** One call's own limit, and the caller's if it has one: whichever ends first. */
const limitOf = (timeoutMs: number, signal?: AbortSignal): AbortSignal =>
  signal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), signal]) : AbortSignal.timeout(timeoutMs)

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
 *
 * The configuration is asked from `loadConfig` on every request and not kept here: the loader
 * (`getKLIntegraatioConfig`) caches with a time limit, so a rotated credential is picked up by a
 * warm Lambda.
 *
 * A configuration that cannot be loaded does propagate, as the rejection of the call: a missing
 * parameter or a failed SSM read is a deployment fault, and must not look like a network error.
 */
export default class KLIntegraatio {
  private readonly _loadConfig: () => Promise<KLIntegraatioConfig>
  private readonly _now: () => number
  private readonly _timeoutMs: number
  private _token?: { expiresAt: number; token: string }
  private _tokenRequest?: Promise<TokenOutcome>

  public constructor(
    loadConfig: () => Promise<KLIntegraatioConfig>,
    { now = Date.now, timeoutMs = CALL_TIMEOUT_MS }: Options = {}
  ) {
    this._loadConfig = loadConfig
    this._now = now
    this._timeoutMs = timeoutMs
  }

  private async _fetchToken(cfg: KLIntegraatioConfig, signal?: AbortSignal): Promise<TokenOutcome> {
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
        signal: limitOf(this._timeoutMs, signal),
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

  private async _getToken(cfg: KLIntegraatioConfig, signal?: AbortSignal): Promise<TokenOutcome> {
    if (this._token && this._token.expiresAt > this._now()) return { token: this._token.token }
    // Concurrent calls wait for the same request. The request is forgotten when it ends, so a failure is retried.
    this._tokenRequest ??= this._fetchToken(cfg, signal).finally(() => {
      this._tokenRequest = undefined
    })
    return this._tokenRequest
  }

  private async _send(token: string, method: string, url: string, body?: object, signal?: AbortSignal) {
    return fetch(url, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      method,
      signal: limitOf(this._timeoutMs, signal),
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
    body?: object,
    signal?: AbortSignal
  ): Promise<KLIntegraatioResult<T>> {
    const cfg = await this._loadConfig()
    const url = joinUrl(cfg.KL_INT_API_URL, path, query)
    logger.info('KLIntegraatio request', { method, path })
    try {
      let outcome = await this._getToken(cfg, signal)
      if (outcome.failure) return outcome.failure
      let res = await this._send(outcome.token, method, url, body, signal)
      if (res.status === 401) {
        // The token may have been revoked before it expired: ask for a new one, once.
        this._token = undefined
        outcome = await this._getToken(cfg, signal)
        if (outcome.failure) return outcome.failure
        res = await this._send(outcome.token, method, url, body, signal)
      }
      return { status: res.status, ...(await this._read<T>(res, path)) }
    } catch (e) {
      logger.error('KLIntegraatio request failed', { error: e, path })
      return { error: errorMessage(e), status: 0 }
    }
  }

  lueKoemuoto(params: KLIntKoemuotoParametrit, { signal }: CallOptions = {}) {
    return this.request<KLIntKoemuoto>('GET', 'Koe/Koemuoto', params, undefined, signal)
  }

  lueKokeet(params: KLIntKokeetParametrit, { signal }: CallOptions = {}) {
    return this.request<KLIntKoeListassa[]>('GET', 'Koe/Kokeet', params, undefined, signal)
  }

  lueKoe(params: KLIntKoeLueParametrit, { signal }: CallOptions = {}) {
    return this.request<KLIntKoe>('GET', 'Koe/Lue', params, undefined, signal)
  }

  /** KL answers 200 with empty fields for a dog it does not find (and for a dead one): that is a 404 here. */
  async lueKoira(params: KLIntKoiraParametrit): Promise<KLIntegraatioResult<KLIntKoira>> {
    const result = await this.request<KLIntKoira>('GET', 'Koira', params)
    if (result.status === 200 && !result.json?.rekisterinumero) {
      logger.warn('KLIntegraatio returned a dog without rekisterinumero, converting to 404')
      return { error: 'not found', status: 404 }
    }
    return result
  }

  /** Saves one dog's result. Saving again for the same dog updates the earlier result. */
  tallennaTulos(tulos: KLIntTulosTallenna, { signal }: CallOptions = {}) {
    return this.request<KLIntTulosTallennaVastaus>('POST', 'Koe/Tulos/Tallenna', undefined, tulos, signal)
  }

  poistaTulos(tulos: KLIntTulosPoista) {
    return this.request<never>('POST', 'Koe/Tulos/Poista', undefined, tulos)
  }

  asetaTila(tila: KLIntAsetaTila, { signal }: CallOptions = {}) {
    return this.request<never>('POST', 'Koe/AsetaTila', undefined, tila, signal)
  }
}

let shared: KLIntegraatio | undefined

/**
 * The one instance of a Lambda container. The token is cached in the instance, so an instance
 * created per invocation would ask KL for a new token on every call.
 */
export const getKLIntegraatio = (): KLIntegraatio => {
  shared ??= new KLIntegraatio(getKLIntegraatioConfig)
  return shared
}
