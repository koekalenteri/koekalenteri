import { vi } from 'vitest'
import { answerRejections, asJsonConfirmedEvent, constructAPIGwEvent } from '../test-utils/helpers'

const mockResponse = vi.fn()
const mockAuthorizeWithMemberOf = vi.fn()
const mockGetEvent = vi.fn()
const mockGetParam = vi.fn()
const mockPreview = vi.fn()
const mockSend = vi.fn()
const mockHandOver = vi.fn()
const mockPublishRegistrationPatches = vi.fn()
const mockPublishEventChange = vi.fn()
const mockRead = vi.fn()

vi.doMock('../lib/lambda', async () => ({
  ...(await vi.importActual<typeof import('../lib/lambda')>('../lib/lambda')),
  getParam: mockGetParam,
  lambda: vi.fn((_name, fn) => answerRejections(fn, mockResponse)),
  response: mockResponse,
}))
vi.doMock('../lib/auth', () => ({ authorizeWithMemberOf: mockAuthorizeWithMemberOf }))
vi.doMock('../lib/event', () => ({ getEvent: mockGetEvent }))
vi.doMock('../lib/kennelliittoResults', () => ({
  handOverKennelliittoResults: mockHandOver,
  previewKennelliittoResults: mockPreview,
  sendKennelliittoResults: mockSend,
}))
vi.doMock('../lib/ws/actions', () => ({
  publishEventChange: mockPublishEventChange,
  publishRegistrationPatches: mockPublishRegistrationPatches,
}))
vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { read: mockRead }
  }),
}))

const { default: kennelliittoResultsLambda } = await import('./handler')

const confirmedEvent = asJsonConfirmedEvent({
  eventType: 'NOME-A SM',
  id: 'event-1',
  organizer: { id: 'org-1', name: 'Org' },
})

const call = (body: unknown) => kennelliittoResultsLambda(constructAPIGwEvent(body, { method: 'POST' }))

describe('kennelliittoResultsLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetParam.mockReturnValue('event-1')
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org-1'], user: { id: 'u1', name: 'Sihteeri' } })
    mockGetEvent.mockResolvedValue(confirmedEvent)
    mockRead.mockImplementation(async (key: Record<string, unknown>) =>
      'eventType' in key ? { eventType: 'NOME-A', official: true } : { id: 'org-1', kcId: 400294 }
    )
    mockPreview.mockResolvedValue({ blockers: [], dogs: [] })
    mockSend.mockResolvedValue({ blockers: [], notAttempted: [], patches: [], reports: [] })
    mockHandOver.mockResolvedValue({ blockers: [], handedOver: true })
  })

  it('is for the organizer of the trial and an administrator, like saving the results', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: ['org-2'], user: { id: 'u2', name: 'Vieras' } })

    await call({ action: 'preview' })

    expect(mockResponse).toHaveBeenCalledWith(403, expect.anything(), expect.anything())
    expect(mockPreview).not.toHaveBeenCalled()
  })

  it('lets an administrator in', async () => {
    mockAuthorizeWithMemberOf.mockResolvedValue({ memberOf: [], user: { admin: true, id: 'u3', name: 'Admin' } })

    await call({ action: 'preview' })

    expect(mockPreview).toHaveBeenCalledTimes(1)
  })

  it('reads the trial as last written, since the lock and the state are read from it', async () => {
    await call({ action: 'preview' })

    expect(mockGetEvent).toHaveBeenCalledWith('event-1', true)
  })

  it('gives the sending the event type as Kennelliitto knows it and the organizer number', async () => {
    await call({ action: 'preview' })

    expect(mockPreview).toHaveBeenCalledWith(
      { event: confirmedEvent, official: true, organizerKcId: 400294, userName: 'Sihteeri' },
      undefined
    )
    // A championship is looked up as its plain format.
    expect(mockRead).toHaveBeenCalledWith({ eventType: 'NOME-A' }, expect.anything())
  })

  it('refuses an action it does not know', async () => {
    await call({ action: 'delete' })

    expect(mockResponse).toHaveBeenCalledWith(400, 'unknown action', expect.anything())
  })

  it('previews and tells the open pages what it found of the trial', async () => {
    mockPreview.mockResolvedValue({ blockers: [], dogs: [], eventPatch: { kcState: { code: 754 }, updatedAt: 'x' } })

    await call({ action: 'preview', registrationIds: ['a'] })

    expect(mockPreview).toHaveBeenCalledWith(expect.anything(), ['a'])
    expect(mockPublishEventChange).toHaveBeenCalledWith({
      audience: 'admin',
      organizerId: 'org-1',
      patch: { eventId: 'event-1', kcState: { code: 754 }, updatedAt: 'x' },
    })
    expect(mockResponse).toHaveBeenCalledWith(200, { blockers: [], dogs: [] }, expect.anything())
  })

  describe('send', () => {
    it.each([[[]], [Array.from({ length: 11 }, (_, i) => `r${i}`)], [undefined]])(
      'takes one to ten dogs, not %j',
      async (registrationIds) => {
        await call({ action: 'send', registrationIds })

        expect(mockResponse).toHaveBeenCalledWith(422, expect.stringContaining('1 to 10'), expect.anything())
        expect(mockSend).not.toHaveBeenCalled()
      }
    )

    it('refuses ids that are not a list of strings', async () => {
      await call({ action: 'send', registrationIds: [1] })

      expect(mockResponse).toHaveBeenCalledWith(422, 'registrationIds must be a list of ids', expect.anything())
    })

    it('sends the ten dogs it is given and publishes what changed on them', async () => {
      const ids = Array.from({ length: 10 }, (_, i) => `r${i}`)
      mockSend.mockResolvedValue({
        blockers: [],
        notAttempted: [],
        patches: [{ id: 'r0', kcResult: { status: 'sent' } }],
        reports: [{ id: 'r0', outcome: 'sent' }],
      })

      await call({ action: 'send', force: true, registrationIds: ids })

      expect(mockSend).toHaveBeenCalledWith(expect.anything(), ids, { force: true })
      expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
        'event-1',
        [{ id: 'r0', kcResult: { status: 'sent' } }],
        'org-1'
      )
      expect(mockResponse).toHaveBeenCalledWith(
        200,
        {
          blockers: [],
          kcResults: [{ id: 'r0', kcResult: { status: 'sent' } }],
          notAttempted: [],
          reports: [{ id: 'r0', outcome: 'sent' }],
        },
        expect.anything()
      )
    })

    it('does not force unless asked to', async () => {
      await call({ action: 'send', registrationIds: ['a'] })

      expect(mockSend).toHaveBeenCalledWith(expect.anything(), ['a'], { force: false })
    })

    it('answers a blocked trial as a conflict with the blockers', async () => {
      mockSend.mockResolvedValue({
        blockers: [{ code: 'handedOver' }],
        notAttempted: [],
        patches: [],
        reports: [],
      })

      await call({ action: 'send', registrationIds: ['a'] })

      expect(mockResponse).toHaveBeenCalledWith(
        409,
        { blockers: [{ code: 'handedOver' }], error: 'blocked' },
        expect.anything()
      )
    })
  })

  describe('handOver', () => {
    it('hands over', async () => {
      await call({ action: 'handOver' })

      expect(mockHandOver).toHaveBeenCalledWith(expect.anything(), { withoutBlocked: false })
      expect(mockResponse).toHaveBeenCalledWith(200, { handedOver: true }, expect.anything())
    })

    it('passes on that the secretary accepted the dogs left out', async () => {
      await call({ action: 'handOver', withoutBlocked: true })

      expect(mockHandOver).toHaveBeenCalledWith(expect.anything(), { withoutBlocked: true })
    })

    it('answers unsent results with the dogs', async () => {
      mockHandOver.mockResolvedValue({ blockers: [], handedOver: false, unsent: [{ id: 'a' }] })

      await call({ action: 'handOver' })

      expect(mockResponse).toHaveBeenCalledWith(409, { dogs: [{ id: 'a' }], error: 'unsentResults' }, expect.anything())
    })

    it('answers dogs that need the secretary’s word with the dogs', async () => {
      mockHandOver.mockResolvedValue({ blockers: [], handedOver: false, needsConfirmation: [{ id: 'b' }] })

      await call({ action: 'handOver' })

      expect(mockResponse).toHaveBeenCalledWith(
        409,
        { dogs: [{ id: 'b' }], error: 'confirmationNeeded' },
        expect.anything()
      )
    })

    it("answers Kennelliitto's refusal as a bad gateway with its reasons", async () => {
      mockHandOver.mockResolvedValue({
        blockers: [],
        handedOver: false,
        refused: { status: 400, virheet: ['Tila ei kelpaa.'] },
      })

      await call({ action: 'handOver' })

      expect(mockResponse).toHaveBeenCalledWith(
        502,
        { error: 'kennelliittoRefused', status: 400, virheet: ['Tila ei kelpaa.'] },
        expect.anything()
      )
    })

    it('publishes the lock', async () => {
      mockHandOver.mockResolvedValue({ blockers: [], eventPatch: { kcState: { code: 1253 } }, handedOver: true })

      await call({ action: 'handOver' })

      expect(mockPublishEventChange).toHaveBeenCalledWith(
        expect.objectContaining({ patch: { eventId: 'event-1', kcState: { code: 1253 } } })
      )
    })
  })
})
