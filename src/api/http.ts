import i18n from 'i18next'
import { enqueueSnackbar } from 'notistack'
import { coalesceRequest } from '../lib/client/coalesceRequest'
import { reportError } from '../lib/client/error'
import { errorSnackbarOptions } from '../lib/client/snackbar'
import { isObject, parseJSON } from '../lib/utils'
import { API_BASE_URL } from '../routeConfig'

type Body = { message?: string; cancelled?: boolean; email?: string; error?: string; reason?: string } | string

interface HttpResponse<T> {
  data: T
  status: number
}

interface HttpRequestInit extends RequestInit {
  coalesceRevision?: number | string
  timeoutMs?: number
}

const NETWORK_RETRY_DELAY_MS = 400

const getDefaultHttpTimeoutMs = () => {
  const configuredHttpTimeoutMs = Number(process.env.REACT_APP_HTTP_TIMEOUT_MS)
  return Number.isFinite(configuredHttpTimeoutMs) && configuredHttpTimeoutMs > 0 ? configuredHttpTimeoutMs : 10_000
}

const getCoalesceKey = (path: string, init: HttpRequestInit | undefined, reviveDates: boolean): string | undefined => {
  if (init?.signal || init?.body !== undefined || (init?.method && init.method.toUpperCase() !== 'GET'))
    return undefined

  const { body: _body, headers, method: _method, signal: _signal, ...options } = init ?? {}
  const optionEntries = Object.entries(options)
  if (
    optionEntries.some(([, value]) => {
      const type = typeof value
      return value !== null && type !== 'boolean' && type !== 'number' && type !== 'string' && type !== 'undefined'
    })
  ) {
    return undefined
  }

  const normalizedHeaders: Array<[string, string]> = []
  new Headers(headers).forEach((value, key) => {
    normalizedHeaders.push([key, value])
  })
  normalizedHeaders.sort(([left], [right]) => left.localeCompare(right))
  optionEntries.sort(([left], [right]) => left.localeCompare(right))

  return `http:get:${JSON.stringify({ headers: normalizedHeaders, options: optionEntries, path, reviveDates })}`
}

const getStatusFromBody = (body: Body | undefined, fallback: string = ''): string => {
  if (isObject(body)) return body.message ?? fallback

  return body ?? fallback
}

const setAuthorizationHeader = (headers: HeadersInit | undefined, token: string): HeadersInit => {
  const authorization = `Bearer ${token}`

  if (headers instanceof Headers) {
    const next = new Headers(headers)
    next.set('Authorization', authorization)
    return next
  }

  if (Array.isArray(headers)) {
    return [...headers.filter(([key]) => key.toLowerCase() !== 'authorization'), ['Authorization', authorization]]
  }

  return { ...headers, Authorization: authorization }
}

export class APIError extends Error {
  status: number
  statusText: string
  body?: Body

  constructor(response: Response, body: Body) {
    const jsonStatus = getStatusFromBody(body)
    const statusText = response.statusText || jsonStatus
    const message = `${response.status} ${statusText}`
    super(message)
    this.status = response.status
    this.statusText = statusText
    this.body = body
  }
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      break
    }

    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      signal: controller.signal,
    })
  }

  return controller.signal
}

const isNetworkError = (error: unknown): boolean => {
  if (!(error instanceof Error) || error.name === 'AbortError') return false

  return /connection|fetch|internet|load failed|network/i.test(error.message)
}

const isAbortError = (error: unknown): boolean => error instanceof Error && error.name === 'AbortError'

const shouldRetryRequest = (init: HttpRequestInit, error: unknown): boolean =>
  init.method?.toUpperCase() === 'GET' && !init.signal?.aborted && !(error instanceof APIError) && isNetworkError(error)

const reportRequestError = (error: unknown) => {
  if (isAbortError(error)) return

  if (!(error instanceof APIError)) {
    enqueueSnackbar(isNetworkError(error) ? i18n.t('error.connectionInterrupted') : `${error}`, errorSnackbarOptions)
  }
  reportError(error)
}

const retryRequest = async <T>(
  path: string,
  init: HttpRequestInit,
  reviveDates: boolean,
  returnStatus: boolean
): Promise<T | HttpResponse<T> | undefined> => {
  await new Promise((resolve) => setTimeout(resolve, NETWORK_RETRY_DELAY_MS))
  if (init.signal?.aborted) return undefined
  return httpWithTimeout<T>(path, init, reviveDates, returnStatus)
}

async function httpWithTimeout<T>(
  path: string,
  init: HttpRequestInit,
  reviveDates: boolean = true,
  returnStatus: boolean = false
): Promise<T | HttpResponse<T>> {
  const url = API_BASE_URL + path
  const { coalesceRevision: _coalesceRevision, timeoutMs = getDefaultHttpTimeoutMs(), ...requestInit } = init

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  const signal = requestInit.signal ? anySignal([controller.signal, requestInit.signal]) : controller.signal

  try {
    const response = await fetch(url, {
      ...requestInit,
      headers: {
        ...requestInit.headers,
        Accept: 'application/json',
      },
      signal,
    })

    clearTimeout(timer)

    const text = await response.text()
    if (!response.ok) {
      let json = text
      try {
        json = parseJSON(text, reviveDates)
      } catch (e) {
        reportError(e)
      }
      throw new APIError(response, json)
    }
    const parsed = parseJSON(text, reviveDates) as T
    if (returnStatus) {
      return { data: parsed, status: response.status }
    }
    return parsed
  } catch (err) {
    clearTimeout(timer)

    if (controller.signal.aborted && controller.signal.reason === 'timeout') {
      throw new APIError(new Response(null, { status: 408, statusText: `timeout loading ${url}` }), {})
    }

    throw err
  }
}

async function http<T>(
  path: string,
  init: HttpRequestInit,
  reviveDates: boolean = true,
  returnStatus: boolean = false
): Promise<T | HttpResponse<T>> {
  try {
    const result = await httpWithTimeout<T>(path, init, reviveDates, returnStatus)

    return result
  } catch (initialError) {
    let err = initialError

    // A network switch commonly rejects an otherwise safe read request. Retry it once;
    // mutations are deliberately left to their callers because their outcome may be unknown.
    if (shouldRetryRequest(init, err)) {
      try {
        const result = await retryRequest<T>(path, init, reviveDates, returnStatus)
        if (result !== undefined) return result
      } catch (retryError) {
        err = retryError
      }
    }

    reportRequestError(err)
    throw err
  }
}

const HTTP = {
  async delete<T, U>(path: string, body: T, init?: HttpRequestInit, reviveDates: boolean = true): Promise<U> {
    return http<U>(path, { body: JSON.stringify(body), method: 'DELETE', ...init }, reviveDates) as Promise<U>
  },
  async get<T>(path: string, init?: HttpRequestInit, reviveDates: boolean = true): Promise<T> {
    const request = () => http<T>(path, { method: 'GET', ...init }, reviveDates) as Promise<T>
    const coalesceKey = getCoalesceKey(path, init, reviveDates)
    return coalesceKey ? coalesceRequest(coalesceKey, request) : request()
  },
  async patch<T, U>(
    path: string,
    body: T,
    init?: HttpRequestInit,
    reviveDates: boolean = true
  ): Promise<HttpResponse<U>> {
    return http<U>(path, { body: JSON.stringify(body), method: 'PATCH', ...init }, reviveDates, true) as Promise<
      HttpResponse<U>
    >
  },
  async post<T, U>(
    path: string,
    body: T,
    init?: HttpRequestInit,
    reviveDates: boolean = true
  ): Promise<HttpResponse<U>> {
    return http<U>(path, { body: JSON.stringify(body), method: 'POST', ...init }, reviveDates, true) as Promise<
      HttpResponse<U>
    >
  },
  async postRaw<T extends BodyInit, U>(
    path: string,
    body: T,
    init?: HttpRequestInit,
    reviveDates: boolean = true
  ): Promise<U> {
    return http<U>(path, { body, method: 'POST', ...init }, reviveDates) as Promise<U>
  },
  async put<T, U>(path: string, body: T, init?: HttpRequestInit, reviveDates: boolean = true): Promise<U> {
    return http<U>(path, { body: JSON.stringify(body), method: 'PUT', ...init }, reviveDates) as Promise<U>
  },
}

export const withToken = (init: HttpRequestInit, token?: string): HttpRequestInit => ({
  ...init,
  headers: token ? setAuthorizationHeader(init.headers, token) : init.headers,
})

export default HTTP
