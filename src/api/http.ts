import { enqueueSnackbar } from 'notistack'

import { rum } from '../lib/client/rum'
import { parseJSON } from '../lib/utils'
import { API_BASE_URL } from '../routeConfig'

export class APIError extends Error {
  status: number
  statusText: string
  result: string

  constructor(response: Response, json: any) {
    const jsonStatus = json?.message ?? json
    const statusText = response.statusText || jsonStatus
    const message = `${response.status} ${statusText}`
    super(message)
    this.status = response.status
    this.statusText = statusText
    this.result = json
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

async function httpWithTimeout<T>(path: string, init: RequestInit): Promise<T> {
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
        json = parseJSON(text)
      } catch (e) {
        rum()?.recordError(e)
        console.error('json parsing failed', e)
      }
      enqueueSnackbar(`${response.status} ${json ?? text}`, { variant: 'error' })
      throw new APIError(response, json)
    }
    const parsed = parseJSON(text)
    return parsed
  } catch (err) {
    clearTimeout(timer)

    if (controller.signal.aborted) {
      throw new APIError(new Response(null, { status: 408, statusText: 'timeout' }), {})
    }

    throw err
  }
}

async function http<T>(path: string, init: RequestInit): Promise<T> {
  try {
    const result = await httpWithTimeout<T>(path, init)

    return result
  } catch (err) {
    rum()?.recordError(err)

    if (!(err instanceof APIError)) {
      enqueueSnackbar(`${err}`, { variant: 'error' })
    } else if (err.status === 401) {
      // reload if token has expired
      if (err.message == 'The incoming token has expired') window.location.reload()
    }

    console.error(err)
    throw err
  }
}

const HTTP = {
  async get<T>(path: string, init?: RequestInit): Promise<T> {
    return http<T>(path, { method: 'get', ...init })
  },
  async post<T, U>(path: string, body: T, init?: RequestInit): Promise<U> {
    return http<U>(path, { method: 'post', body: JSON.stringify(body), ...init })
  },
  async postRaw<T extends BodyInit, U>(path: string, body: T, init?: RequestInit): Promise<U> {
    return http<U>(path, { method: 'post', body, ...init })
  },
  async put<T, U>(path: string, body: T, init?: RequestInit): Promise<U> {
    return http<U>(path, { method: 'put', body: JSON.stringify(body), ...init })
  },
  async delete<T, U>(path: string, body: T, init?: RequestInit): Promise<U> {
    return http<U>(path, { method: 'delete', body: JSON.stringify(body), ...init })
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
