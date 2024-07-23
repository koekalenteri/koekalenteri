import http, { withToken } from './http'

const PATH = '/admin/migrate'

export const runMigrations = async (token?: string, signal?: AbortSignal): Promise<void> =>
  http.post(PATH, undefined, withToken({ signal }, token))
