import config from '../config';

const BASE_URL = config.api_base_url.endsWith('/') ? config.api_base_url.substr(0, -1) : config.api_base_url;

async function http<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(buildURL(path), init);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.json().catch(() => ({}));
}

function buildURL(path: string): string {
  if (path.startsWith('/')) {
    path = path.substr(1);
  }
  return BASE_URL + '/' + path;
}

const HTTP = {
  async get<T>(path: string, init?: RequestInit): Promise<T> {
    return await http<T>(path, { method: 'get', ...init });
  },
  async post<T, U>(path: string, body: T, init?: RequestInit): Promise<U> {
    return await http<U>(path, { method: 'post', body: JSON.stringify(body), ...init });
  },
  async put<T, U>(path: string, body: T, init?: RequestInit): Promise<U> {
    return await http<U>(path, { method: 'put', body: JSON.stringify(body), ...init });
  },
  async delete<T, U>(path: string, body: T, init?: RequestInit): Promise<U> {
    return await http<U>(path, { method: 'delete', body: JSON.stringify(body), ...init });
  }
};

export default HTTP;
