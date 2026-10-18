import type { Dog, JsonDog } from '../types'
import { toDog } from '../lib/wire'
import http from './http'

const PATH = '/dog/'

export async function getDog(regNo: string, refresh?: boolean, signal?: AbortSignal): Promise<Dog> {
  const encodedRegNo = regNo.replaceAll('/', '~')
  const qs = refresh ? '?refresh' : ''
  return toDog(await http.get<JsonDog>(`${PATH}${encodedRegNo}${qs}`, { signal }))
}
