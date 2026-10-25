import type { APIGatewayProxyResult } from 'aws-lambda'
import type { JsonUser } from '../../types'
import type { EventClassStatsRow } from '../../types/Stats'
import { vi } from 'vitest'
import { httpError } from '../lib/lambda'
import { constructAPIGwEvent } from '../test-utils/helpers'

const mockAuthorizeAdmin = vi.fn<() => Promise<JsonUser>>()
const mockGetEventClassStats = vi.fn<(season: number) => Promise<EventClassStatsRow[]>>()

vi.doMock('../lib/auth', () => ({ authorizeAdmin: mockAuthorizeAdmin }))
vi.doMock('../lib/stats/eventClassStats', () => ({ getEventClassStats: mockGetEventClassStats }))

const { default: getEventClassStatsLambda } = await import('./handler')

const isProxyResult = (value: unknown): value is APIGatewayProxyResult =>
  typeof value === 'object' && value !== null && 'statusCode' in value && 'body' in value

/** The handler's answer: the metrics wrapper does not type what it hands back. */
const invoke = async (query?: Record<string, string>): Promise<APIGatewayProxyResult> => {
  const result: unknown = await getEventClassStatsLambda(constructAPIGwEvent({}, query ? { query } : {}))
  if (!isProxyResult(result)) throw new Error('the handler answered something other than a proxy result')
  return result
}

const admin: JsonUser = {
  admin: true,
  createdAt: '',
  createdBy: 'test',
  email: 'admin@example.com',
  id: 'admin',
  modifiedAt: '',
  modifiedBy: 'test',
  name: 'Admin',
}

const row: EventClassStatsRow = {
  cancelled: 0,
  class: 'ALO',
  cost: 50,
  days: ['2025-06-01'],
  endDate: '2025-06-01',
  entries: 3,
  eventType: 'NOME-B',
  location: 'Somewhere',
  organizerId: 'org-1',
  paidAmount: 150,
  pickedFromReserve: 1,
  places: 10,
  priority: [],
  priorityEntries: 0,
  refundedAmount: 0,
  startDate: '2025-06-01',
  state: 'completed',
}

describe('getEventClassStatsLambda', () => {
  vi.spyOn(console, 'debug').mockImplementation(() => undefined)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("answers the season's rows to an admin", async () => {
    mockAuthorizeAdmin.mockResolvedValueOnce(admin)
    mockGetEventClassStats.mockResolvedValueOnce([row])

    const result = await invoke({ season: '2025' })

    expect(mockGetEventClassStats).toHaveBeenCalledWith(2025)
    expect(result.statusCode).toBe(200)
    expect(JSON.parse(result.body)).toEqual([row])
  })

  it.each([undefined, '25', '2025.5', '0x7E9', '2025-2026'])('refuses the season %s', async (season) => {
    mockAuthorizeAdmin.mockResolvedValueOnce(admin)

    const result = await invoke(season === undefined ? undefined : { season })

    expect(result.statusCode).toBe(400)
    expect(mockGetEventClassStats).not.toHaveBeenCalled()
  })

  it('reads nothing for a caller who is not an admin', async () => {
    mockAuthorizeAdmin.mockRejectedValueOnce(httpError(403, 'Forbidden'))

    const result = await invoke({ season: '2025' })

    expect(result.statusCode).toBe(403)
    expect(mockGetEventClassStats).not.toHaveBeenCalled()
  })
})
