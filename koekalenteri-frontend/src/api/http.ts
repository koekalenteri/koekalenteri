import { API_BASE_URL } from "../config";

class APIError extends Error {
  status: number;
  statusText: string;
  result: string;

  constructor(response: Response, json: any) {
    const message = `${response.status} ${json.message || response.statusText}`;
    super(message);
    this.status = response.status;
    this.statusText = response.statusText;
    this.result = json.message;
  }
}

async function http<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(API_BASE_URL + path, init);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new APIError(response, json);
  }
  return json;
}

const HTTP = {
  async get<T>(path: string, init?: RequestInit): Promise<T> {
    return http<T>(path, { method: 'get', ...init });
  },
  async post<T, U>(path: string, body: T, init?: RequestInit): Promise<U> {
    return http<U>(path, { method: 'post', body: JSON.stringify(body), ...init });
  },
  async put<T, U>(path: string, body: T, init?: RequestInit): Promise<U> {
    return http<U>(path, { method: 'put', body: JSON.stringify(body), ...init });
  },
  async delete<T, U>(path: string, body: T, init?: RequestInit): Promise<U> {
    return http<U>(path, { method: 'delete', body: JSON.stringify(body), ...init });
  }
};

export default HTTP;
