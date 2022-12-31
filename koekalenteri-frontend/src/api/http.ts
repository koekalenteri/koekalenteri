import { API_BASE_URL } from "../routeConfig"
import { parseJSON } from "../utils"

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
  console.debug(`fetch: ${url}`, init)
  const response = await fetch(url, init)
  const text = await response.text()
  if (!response.ok) {
    throw new APIError(response, text)
  }
  const parsed = parseJSON(text)
  console.debug('response', parsed)
  return parsed
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

export default HTTP
