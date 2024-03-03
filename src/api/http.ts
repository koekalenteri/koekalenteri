import { fetchAuthSession } from 'aws-amplify/auth'
import { enqueueSnackbar } from 'notistack'

import { reportError } from '../lib/client/rum'
import { parseJSON } from '../lib/utils'
import { API_BASE_URL } from '../routeConfig'

export class APIError extends Error {
  status: number
  statusText: string
  body?: any

  constructor(response: Response, body: any) {
    const jsonStatus = body?.message ?? body
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

async function httpWithTimeout<T>(path: string, init: RequestInit, reviveDates: boolean = true): Promise<T> {
  const url = API_BASE_URL + path

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), 10000)
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
      if (![401, 404].includes(response.status)) {
        enqueueSnackbar(`${response.status} ${text}`, { variant: 'error' })
      }
      throw new APIError(response, json)
    }
    const parsed = parseJSON(text, reviveDates)
    return parsed
  } catch (err) {
    clearTimeout(timer)

    if (controller.signal.aborted) {
      throw new APIError(new Response(null, { status: 408, statusText: 'timeout' }), {})
    }

    throw err
  }
}

async function http<T>(path: string, init: RequestInit, reviveDates: boolean = true): Promise<T> {
  try {
    const result = await httpWithTimeout<T>(path, init, reviveDates)

    return result
  } catch (err) {
    if (!(err instanceof APIError)) {
      enqueueSnackbar(`${err}`, { variant: 'error' })
    } else if (err.status === 401) {
      const msg = err.body?.message ?? err.body ?? err.message
      if (msg == 'The incoming token has expired' && init.headers && 'Authorization' in init.headers) {
        // token expired, try to refresh
        const session = await fetchAuthSession({ forceRefresh: true })
        const idToken = session.tokens?.idToken?.toString()
        if (idToken) {
          const key = 'idToken'
          const newValue = JSON.stringify(idToken)
          localStorage.setItem(key, newValue)
          dispatchEvent(new StorageEvent('storage', { storageArea: localStorage, key, newValue }))
          // retry with new token after a little delay
          await new Promise((resolve) => setTimeout(resolve, 50))
          init = withToken(init, idToken)
          return http<T>(path, init, reviveDates)
        }
      }
    }

    reportError(err)
    throw err
  }
}

const HTTP = {
  async get<T>(path: string, init?: RequestInit, reviveDates: boolean = true): Promise<T> {
    return http<T>(path, { method: 'get', ...init }, reviveDates)
  },
  async post<T, U>(path: string, body: T, init?: RequestInit, reviveDates: boolean = true): Promise<U> {
    return http<U>(path, { method: 'post', body: JSON.stringify(body), ...init }, reviveDates)
  },
  async postRaw<T extends BodyInit, U>(
    path: string,
    body: T,
    init?: RequestInit,
    reviveDates: boolean = true
  ): Promise<U> {
    return http<U>(path, { method: 'post', body, ...init }, reviveDates)
  },
  async put<T, U>(path: string, body: T, init?: RequestInit, reviveDates: boolean = true): Promise<U> {
    return http<U>(path, { method: 'put', body: JSON.stringify(body), ...init }, reviveDates)
  },
  async delete<T, U>(path: string, body: T, init?: RequestInit, reviveDates: boolean = true): Promise<U> {
    return http<U>(path, { method: 'delete', body: JSON.stringify(body), ...init }, reviveDates)
  },
}

export const withToken = (init: RequestInit, token?: string): RequestInit => ({
  ...init,
  headers: {
    ...init.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : undefined),
  },
})

export default HTTP
