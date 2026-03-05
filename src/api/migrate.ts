import http, { withToken } from './http'

const PATH = '/admin/migrate'

export const runMigrations = async (token?: string, signal?: AbortSignal): Promise<void> =>
  (await http.post<undefined, void>(PATH, undefined, withToken({ signal }, token))).data
