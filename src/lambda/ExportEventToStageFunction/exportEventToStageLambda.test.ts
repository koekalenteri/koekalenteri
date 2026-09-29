import type { JsonDogEvent, JsonRegistration } from '../../types'
import { vi } from 'vitest'
import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { jsonRegistrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import { CONFIG } from '../config'
import { httpError } from '../lib/lambda'
import { answerRejections, constructPartialAPIGwEvent } from '../test-utils/helpers'

const mockLambda = vi.fn((_name, fn) => answerRejections(fn, mockResponse))
const mockResponse = vi.fn()
const mockAuthorize = vi.fn()
const mockGetEvent = vi.fn<(id: string) => Promise<JsonDogEvent>>()
const mockGetRegistrations = vi.fn<(id: string) => Promise<JsonRegistration[]>>()
const mockRead = vi.fn()
const mockCopyFile = vi.fn()
const mockAudit = vi.fn()
const mockInvoke = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  lambda: mockLambda,
  response: mockResponse,
}))
vi.doMock('../lib/auth', () => ({
  authorizeAdmin: async () => {
    const user = await mockAuthorize()
    if (!user) throw httpError(401, 'Unauthorized')
    if (!user.admin) throw httpError(403, 'Forbidden')
    return user
  },
}))
vi.doMock('../lib/event', () => ({ getEvent: mockGetEvent }))
vi.doMock('../lib/registration', async () => ({
  ...(await vi.importActual<typeof import('../lib/registration')>('../lib/registration')),
  getRegistrationsByEventId: mockGetRegistrations,
}))
vi.doMock('../lib/file', () => ({ copyFileToBucket: mockCopyFile }))
vi.doMock('../lib/audit', async () => ({
  ...(await vi.importActual<typeof import('../lib/audit')>('../lib/audit')),
  audit: mockAudit,
}))
vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { read: mockRead }
  }),
}))
vi.doMock('@aws-sdk/client-lambda', () => ({
  InvokeCommand: vi.fn(function MockInvokeCommand(input) {
    return { input }
  }),
  LambdaClient: vi.fn(function MockLambdaClient() {
    return { send: mockInvoke }
  }),
}))

const { default: exportEventToStageLambda } = await import('./handler')

const admin = { admin: true, email: 'jukka@example.com', id: 'u1', name: 'Jukka Kopioija' }

const sourceEvent = (): JsonDogEvent => ({
  ...JSON.parse(JSON.stringify(eventWithParticipantsInvited)),
  contactInfo: { secretary: { email: 'sihteeri@seura.fi', name: 'Sanna Sihteeri', phone: '040 123 4567' } },
  invitationAttachment: 'attachment-1',
  secretary: { email: 'sihteeri@seura.fi', name: 'Sanna Sihteeri', phone: '040 123 4567' },
})

const sourceRegistrations = (): JsonRegistration[] =>
  jsonRegistrationsToEventWithParticipantsInvited.slice(0, 2).map((registration, i) => ({
    ...registration,
    handler: { email: `ohjaaja${i}@example.fi`, membership: false, name: `Ohjaaja ${i}`, phone: '050 111 2222' },
    owner: { email: `omistaja${i}@example.fi`, membership: false, name: `Omistaja ${i}` },
  }))

const invokeResult = (payload: unknown, functionError?: string) => ({
  ...(functionError ? { FunctionError: functionError } : {}),
  Payload: new TextEncoder().encode(JSON.stringify(payload)),
})

const request = (body: unknown) => constructPartialAPIGwEvent({ body: JSON.stringify(body) })

describe('exportEventToStageLambda', () => {
  const { stackName, stageName } = CONFIG

  beforeEach(() => {
    vi.clearAllMocks()
    CONFIG.stageName = 'prod'
    CONFIG.stackName = 'koekalenteri-prod'
    mockAuthorize.mockResolvedValue(admin)
    mockGetEvent.mockResolvedValue(sourceEvent())
    mockGetRegistrations.mockResolvedValue(sourceRegistrations())
    mockRead.mockResolvedValue({ id: 'org-prod', kcId: 1234, name: 'Seura' })
    mockInvoke.mockResolvedValue(invokeResult({ eventId: 'copy-1', judges: [] }))
  })

  afterAll(() => {
    CONFIG.stageName = stageName
    CONFIG.stackName = stackName
  })

  it("sends the target a copy with every person replaced, and none of the source's people (KOE-1471)", async () => {
    let sent = ''
    mockInvoke.mockImplementationOnce(async ({ input }: { input: { Payload: Uint8Array } }) => {
      sent = new TextDecoder().decode(input.Payload)
      return invokeResult({ eventId: 'copy-1', judges: [] })
    })
    const event = request({ eventId: 'source-1', target: 'test' })

    await exportEventToStageLambda(event)

    expect(mockInvoke).toHaveBeenCalledWith({
      input: expect.objectContaining({ FunctionName: 'koekalenteri-test-ImportCopiedEvent' }),
    })
    for (const original of ['sihteeri@seura.fi', 'Sanna Sihteeri', '040 123 4567', 'ohjaaja0@', 'Omistaja 1']) {
      expect(sent).not.toContain(original)
    }
    expect(JSON.parse(sent)).toEqual({
      copier: { email: admin.email, name: admin.name },
      copy: {
        event: expect.objectContaining({ id: eventWithParticipantsInvited.id }),
        registrations: expect.any(Array),
      },
      organizerKcId: 1234,
      source: { eventId: 'source-1', stage: 'prod' },
    })
    expect(mockCopyFile).toHaveBeenCalledWith('attachment-1', 'koekalenteri-test-event-attachments')
    expect(mockAudit).toHaveBeenCalledWith({
      auditKey: `event:${eventWithParticipantsInvited.id}`,
      message: 'Kopioitu ympäristöön test (copy-1)',
      user: admin.name,
    })
    expect(mockResponse).toHaveBeenCalledWith(200, { eventId: 'copy-1', judges: [], target: 'test' }, event)
  })

  it.each([
    ['prod', 'prod', 'koekalenteri-prod'],
    ['test', 'test', 'koekalenteri-test'],
    ['dev', 'dev', 'koekalenteri-dev'],
    ['anywhere', 'prod', 'koekalenteri-prod'],
    ['test', '', 'local'],
  ])('refuses to copy to %s from %s', async (target, stage, stack) => {
    CONFIG.stageName = stage
    CONFIG.stackName = stack
    const event = request({ eventId: 'source-1', target })

    await exportEventToStageLambda(event)

    expect(mockResponse).toHaveBeenCalledWith(400, expect.anything(), event)
    expect(mockGetEvent).not.toHaveBeenCalled()
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('copies between test and dev', async () => {
    CONFIG.stageName = 'dev'
    CONFIG.stackName = 'koekalenteri-dev'

    await exportEventToStageLambda(request({ eventId: 'source-1', target: 'test' }))

    expect(mockInvoke).toHaveBeenCalledWith({
      input: expect.objectContaining({ FunctionName: 'koekalenteri-test-ImportCopiedEvent' }),
    })
  })

  it('is for admins only', async () => {
    mockAuthorize.mockResolvedValueOnce({ ...admin, admin: false })
    const event = request({ eventId: 'source-1', target: 'test' })

    await exportEventToStageLambda(event)

    expect(mockResponse).toHaveBeenCalledWith(403, 'Forbidden', event)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it("needs the organizer's Kennel Club number to find it in the target", async () => {
    mockRead.mockResolvedValueOnce({ id: 'org-prod', name: 'Seura' })
    const event = request({ eventId: 'source-1', target: 'test' })

    await exportEventToStageLambda(event)

    expect(mockResponse).toHaveBeenCalledWith(
      412,
      { message: `The organizer ${eventWithParticipantsInvited.organizer.name} has no Kennel Club number to match by` },
      event
    )
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it("passes on the target's refusal", async () => {
    mockInvoke.mockResolvedValueOnce(
      invokeResult({ errorMessage: 'The copier is not an admin in the target environment' }, 'Unhandled')
    )
    const event = request({ eventId: 'source-1', target: 'test' })

    await exportEventToStageLambda(event)

    expect(mockResponse).toHaveBeenCalledWith(
      502,
      { message: 'The target refused the copy: The copier is not an admin in the target environment' },
      event
    )
    expect(mockAudit).not.toHaveBeenCalled()
  })

  it('refuses a copy too large to send in one invocation', async () => {
    // The description is published text and stays in the copy; notes would be replaced
    mockGetEvent.mockResolvedValueOnce({ ...sourceEvent(), description: 'x'.repeat(7 * 1024 * 1024) })
    const event = request({ eventId: 'source-1', target: 'test' })

    await exportEventToStageLambda(event)

    expect(mockResponse).toHaveBeenCalledWith(413, { message: 'The event is too large to copy in one go' }, event)
    expect(mockInvoke).not.toHaveBeenCalled()
  })
})
