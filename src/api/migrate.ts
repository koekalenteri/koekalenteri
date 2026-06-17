import http, { withToken } from './http'

const PATH = '/admin/migrate'

export interface MigrationResult {
  count: number
  name: string
}

export const runMigrations = (token?: string, signal?: AbortSignal) =>
  http.post<undefined, MigrationResult[]>(PATH, undefined, withToken({ signal }, token))
