import type { Organizer } from '../../types'

const mockOrganizers: Organizer[] = [
  {
    id: '1',
    name: 'Järjestäjä 1',
  },
  {
    id: '2',
    name: 'Järjestäjä 2',
  },
]

export const getAdminOrganizers = vi.fn(
  async (_token: string, _refresh?: boolean, _signal?: AbortSignal): Promise<Organizer[]> =>
    new Promise((resolve) => {
      process.nextTick(() => resolve(mockOrganizers))
    })
)
