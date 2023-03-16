import { API_BASE_URL } from '../routeConfig'
import { parseJSON } from '../utils'

class APIError extends Error {
  status: number
  statusText: string
  result: string

  constructor(response: Response, json: any) {
    const message = `${response.status} ${json.message || response.statusText}`
    super(message)
    this.status = response.status
    this.statusText = response.statusText
    this.result = json.message
  }
}

async function http<T>(path: string, init: RequestInit): Promise<T> {
  const url = API_BASE_URL + path
  // console.debug(`fetch: ${url}`, init)
  try {
    const response = await fetch(url, init)
    const text = await response.text()
    if (!response.ok) {
      let json = text
      try {
        json = parseJSON(text)
      } catch (e) {}
      throw new APIError(response, json)
    }
    const parsed = parseJSON(text)
    // console.debug('response', parsed)
    return parsed
  } catch (err) {
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
