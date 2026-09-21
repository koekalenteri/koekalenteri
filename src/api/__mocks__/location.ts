import type { Location } from '../../types'

export const getLocations = vi.fn(async (_token: string, _signal?: AbortSignal): Promise<Location[]> => [])
