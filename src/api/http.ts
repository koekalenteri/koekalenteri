import { enqueueSnackbar } from 'notistack'
import { reportError } from '../lib/client/error'
import { errorSnackbarOptions } from '../lib/snackbar'
import { isObject, parseJSON } from '../lib/utils'
import { API_BASE_URL } from '../routeConfig'

type Body = { message?: string; cancelled?: boolean; email?: string; error?: string; reason?: string } | string

interface HttpResponse<T> {
  data: T
  status: number
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

async function httpWithTimeout<T>(
  path: string,
  init: RequestInit,
  reviveDates: boolean = true,
  returnStatus: boolean = false
): Promise<T | HttpResponse<T>> {
  const url = API_BASE_URL + path

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), 10_000)
  const signal = init.signal ? anySignal([controller.signal, init.signal]) : controller.signal

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...init.headers,
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
  init: RequestInit,
  reviveDates: boolean = true,
  returnStatus: boolean = false
): Promise<T | HttpResponse<T>> {
  try {
    const result = await httpWithTimeout<T>(path, init, reviveDates, returnStatus)

    return result
  } catch (err) {
    if (!(err instanceof APIError)) {
      enqueueSnackbar(`${err}`, errorSnackbarOptions)
    }

    reportError(err)
    throw err
  }
}

const HTTP = {
  async delete<T, U>(path: string, body: T, init?: RequestInit, reviveDates: boolean = true): Promise<U> {
    return http<U>(path, { body: JSON.stringify(body), method: 'delete', ...init }, reviveDates) as Promise<U>
  },
  async get<T>(path: string, init?: RequestInit, reviveDates: boolean = true): Promise<T> {
    return http<T>(path, { method: 'get', ...init }, reviveDates) as Promise<T>
  },
  async patch<T, U>(path: string, body: T, init?: RequestInit, reviveDates: boolean = true): Promise<HttpResponse<U>> {
    return http<U>(path, { body: JSON.stringify(body), method: 'patch', ...init }, reviveDates, true) as Promise<
      HttpResponse<U>
    >
  },
  async post<T, U>(path: string, body: T, init?: RequestInit, reviveDates: boolean = true): Promise<HttpResponse<U>> {
    return http<U>(path, { body: JSON.stringify(body), method: 'post', ...init }, reviveDates, true) as Promise<
      HttpResponse<U>
    >
  },
  async postRaw<T extends BodyInit, U>(
    path: string,
    body: T,
    init?: RequestInit,
    reviveDates: boolean = true
  ): Promise<U> {
    return http<U>(path, { body, method: 'post', ...init }, reviveDates) as Promise<U>
  },
  async put<T, U>(path: string, body: T, init?: RequestInit, reviveDates: boolean = true): Promise<U> {
    return http<U>(path, { body: JSON.stringify(body), method: 'put', ...init }, reviveDates) as Promise<U>
  },
}

export const withToken = (init: RequestInit, token?: string): RequestInit => ({
  ...init,
  headers: token ? setAuthorizationHeader(init.headers, token) : init.headers,
})

export default HTTP
