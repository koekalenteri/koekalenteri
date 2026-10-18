import { vi } from 'vitest'
import { httpError } from '../lib/lambda'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'

const setEventBody = (event: { body: string | null }, body: unknown) => {
  event.body = JSON.stringify(body)
}

const mockPublishAdminDataInvalidation = vi.fn()
vi.doMock('../lib/ws/actions', () => ({
  publishAdminDataInvalidation: mockPublishAdminDataInvalidation,
}))

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockAuthorize = vi.fn()
const mockSaveOrganizer = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  lambda: mockLambda,
  response: mockResponse,
}))

vi.doMock('../lib/auth', () => ({
  authorize: mockAuthorize,
  authorizeAdmin: async (event: any) => {
    const user = await mockAuthorize(event)
    if (!user) throw httpError(401, 'Unauthorized')
    if (!user.admin) throw httpError(403, 'Forbidden')
    return user
  },
}))

vi.doMock('../lib/repositories/organizerRepository', () => ({
  saveOrganizer: mockSaveOrganizer,
}))

const { default: putOrganizerLambda } = await import('./handler')

describe('putOrganizerLambda', () => {
  const changes = {
    email: 'test@example.com',
    id: 'org123',
    name: 'Test Organizer',
    paytrailMerchantId: 'merchant123',
  }
  const stored = { ...changes, address: '123 Main St' }
  const event = constructPartialAPIGwEvent({ body: JSON.stringify(changes), headers: {} })

  beforeEach(() => {
    vi.clearAllMocks()

    mockAuthorize.mockResolvedValue({
      admin: true,
      id: 'user123',
      name: 'Test User',
    })

    setEventBody(event, changes)

    mockSaveOrganizer.mockResolvedValue(stored)
  })

  it('returns 403 if authenticated user is not an admin', async () => {
    mockAuthorize.mockResolvedValueOnce({
      admin: false,
      id: 'user123',
      name: 'Test User',
    })

    await putOrganizerLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(mockSaveOrganizer).not.toHaveBeenCalled()
    expect(mockPublishAdminDataInvalidation).not.toHaveBeenCalled()
  })

  it('returns 400 if organizer id is missing', async () => {
    setEventBody(event, {
      email: 'test@example.com',
      name: 'Test Organizer',
    })

    await putOrganizerLambda(event)

    expect(mockAuthorize).toHaveBeenCalledWith(event)
    expect(mockResponse).toHaveBeenCalledWith(400, 'no data', event)
    expect(mockSaveOrganizer).not.toHaveBeenCalled()
    expect(mockPublishAdminDataInvalidation).not.toHaveBeenCalled()
  })

  it('saves the changes, tells the admin pages and answers with the row as stored', async () => {
    await putOrganizerLambda(event)

    expect(mockSaveOrganizer).toHaveBeenCalledWith(changes)
    expect(mockPublishAdminDataInvalidation).toHaveBeenCalledWith(['organizers'])
    expect(mockResponse).toHaveBeenCalledWith(200, stored, event)
  })
})
