import type { JsonConfirmedEvent, JsonRegistration } from '../../types'
import { vi } from 'vitest'
import { eventWithStaticDates } from '../../__mockData__/events'
import { registrationWithStaticDates } from '../../__mockData__/registrations'

const mockUpdateRegistrations = vi.fn<(eventId: string) => Promise<JsonConfirmedEvent>>()
const mockRepairReadyRegistrationGroups = vi.fn<() => Promise<Partial<JsonRegistration>[]>>()
vi.doMock('./event', () => ({
  repairReadyRegistrationGroups: mockRepairReadyRegistrationGroups,
  updateRegistrations: mockUpdateRegistrations,
}))

const mockApplyNewRegistrationStatsOnce = vi.fn()
const mockUpdateEventStatsForRegistration = vi.fn()
vi.doMock('./stats', () => ({
  applyNewRegistrationStatsOnce: mockApplyNewRegistrationStatsOnce,
  updateEventStatsForRegistration: mockUpdateEventStatsForRegistration,
}))

const mockPublishEventCounts = vi.fn()
const mockPublishRegistrationPatches = vi.fn()
const mockPublishRegistrationPatchesStrict = vi.fn()
vi.doMock('./ws/actions', () => ({
  publishEventCounts: mockPublishEventCounts,
  publishRegistrationPatches: mockPublishRegistrationPatches,
  publishRegistrationPatchesStrict: mockPublishRegistrationPatchesStrict,
}))

const mockPublishPublicStartList = vi.fn()
vi.doMock('./ws/publicStartList', () => ({ publishPublicStartList: mockPublishPublicStartList }))

const mockAudit = vi.fn()
const mockAuditStrict = vi.fn()
vi.doMock('./audit', () => ({
  audit: mockAudit,
  auditStrict: mockAuditStrict,
  registrationAuditKey: (registration: Pick<JsonRegistration, 'eventId' | 'id'>) =>
    `${registration.eventId}:${registration.id}`,
}))

const mockSendTemplatedMail = vi.fn()
const libEmail = await import('./email')
vi.doMock('./email', () => ({ ...libEmail, sendTemplatedMail: mockSendTemplatedMail }))

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return {}
  }),
}))

const mockClaimNewRegistrationPostProcessing = vi.fn()
const mockMarkNewRegistrationPhase = vi.fn()
const mockClearRegistrationEmailDeliveryStatus = vi.fn()
const libRegistration = await import('./registration')
vi.doMock('./registration', () => ({
  ...libRegistration,
  claimNewRegistrationPostProcessing: mockClaimNewRegistrationPostProcessing,
  clearRegistrationEmailDeliveryStatus: mockClearRegistrationEmailDeliveryStatus,
  getRegistrationEditToken: async () => 'edit-token',
  markNewRegistrationPhase: mockMarkNewRegistrationPhase,
}))

const {
  applyRegistrationPatchRequest,
  completeNewRegistration,
  finalizeRegistrationUpdate,
  hasEmailRecipients,
  initializeNewRegistration,
  parseRegistrationRequest,
  resolveDuplicateRegistration,
} = await import('./registrationWorkflow')

const confirmedEvent: JsonConfirmedEvent = JSON.parse(JSON.stringify(eventWithStaticDates))
const recounted: JsonConfirmedEvent = { ...confirmedEvent, entries: 7, organizer: { id: 'org-1', name: 'Org' } }
const registration: JsonRegistration = JSON.parse(JSON.stringify(registrationWithStaticDates))
const user = { name: 'Test User' }
const origin = 'https://koekalenteri.snj.fi'

const withoutEmail = (person: JsonRegistration['handler']): JsonRegistration['handler'] =>
  person && { ...person, email: '' }

const claimOf = (saved: JsonRegistration) => ({
  registration: saved,
  release: vi.fn(async () => undefined),
  token: 'token',
})

describe('registrationWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateRegistrations.mockResolvedValue(recounted)
    mockRepairReadyRegistrationGroups.mockResolvedValue([])
  })

  describe('parseRegistrationRequest', () => {
    it('takes a plain body as the registration', () => {
      const body = { eventId: 'e1', id: 'r1', notes: 'hi' }
      expect(parseRegistrationRequest(body, true)).toEqual({ operationRequest: undefined, registration: body })
    })

    it('takes a patch request as its identity and keeps the operations for later', () => {
      const body = { eventId: 'e1', id: 'r1', operations: [{ path: ['notes'], type: 'CHANGE' as const, value: 'hi' }] }
      expect(parseRegistrationRequest(body, true)).toEqual({
        operationRequest: body,
        registration: { eventId: 'e1', id: 'r1' },
      })
    })

    it('rejects operations that are not a list, and metadata of the wrong type', () => {
      expect(parseRegistrationRequest({ eventId: 'e1', id: 'r1', operations: 'x' } as never, true)).toEqual({
        invalid: 'invalid patch operations',
      })
      expect(
        parseRegistrationRequest({ eventId: 'e1', id: 'r1', modifiedAt: 5, operations: [] } as never, true)
      ).toEqual({ invalid: 'invalid patch metadata' })
    })

    it('does not read operations off a PUT body', () => {
      const body = { eventId: 'e1', id: 'r1', operations: [] }
      expect(parseRegistrationRequest(body as never, false)).toEqual({
        operationRequest: undefined,
        registration: body,
      })
    })
  })

  describe('applyRegistrationPatchRequest', () => {
    const request = (operations: { path: (string | number)[]; type: 'CHANGE'; value: unknown }[]) => ({
      eventId: registration.eventId,
      id: registration.id,
      operations,
    })

    it('applies the operations to a copy and normalizes the addresses on it', () => {
      const existing = JSON.parse(JSON.stringify(registration))
      const patched = applyRegistrationPatchRequest(
        existing,
        request([{ path: ['handler', 'email'], type: 'CHANGE', value: ' New@Example.com ' }]),
        () => true
      )

      expect(patched.handler?.email).toBe('new@example.com')
      expect(existing.handler.email).toBe(registration.handler?.email)
    })

    it('refuses a field the caller does not allow', () => {
      expect(() =>
        applyRegistrationPatchRequest(
          registration,
          request([{ path: ['notes'], type: 'CHANGE', value: 'x' }]),
          (field) => field !== 'notes'
        )
      ).toThrow('patch changes a protected registration field')
    })

    it('refuses an operation that moves the registration', () => {
      expect(() =>
        applyRegistrationPatchRequest(
          registration,
          request([{ path: ['id'], type: 'CHANGE', value: 'other' }]),
          () => true
        )
      ).toThrow('patch must not change registration identity')
    })

    it('refuses an operation that leaves an array field as something else', () => {
      expect(() =>
        applyRegistrationPatchRequest(
          registration,
          request([{ path: ['dates'], type: 'CHANGE', value: 'x' }]),
          () => true
        )
      ).toThrow('registration array fields must be arrays')
    })
  })

  describe('hasEmailRecipients', () => {
    it('needs the handler and an owner to have an address', () => {
      expect(hasEmailRecipients(registration)).toBe(true)
      expect(hasEmailRecipients({ ...registration, handler: withoutEmail(registration.handler) })).toBe(false)
      expect(hasEmailRecipients({ ...registration, owner: withoutEmail(registration.owner), owners: [] })).toBe(false)
    })
  })

  describe('initializeNewRegistration', () => {
    it('gives the registration its identity and creation stamp', () => {
      const draft: Partial<JsonRegistration> = { eventId: 'e1' }
      initializeNewRegistration(draft, '2024-01-01T00:00:00.000Z', user, 'creating')

      expect(draft).toEqual({
        createdAt: '2024-01-01T00:00:00.000Z',
        createdBy: 'Test User',
        editTokenVersion: 1,
        eventId: 'e1',
        id: expect.stringMatching(/^[A-Za-z0-9_-]{10}$/),
        state: 'creating',
      })
    })
  })

  describe('completeNewRegistration', () => {
    const complete = (saved: JsonRegistration) =>
      completeNewRegistration({
        auditMessage: 'Ilmoittautui',
        confirmedEvent,
        groupPatches: [
          { group: { key: 'reserve', number: 2 }, id: 'other' },
          { group: saved.group, id: saved.id },
        ],
        origin,
        registration: saved,
        user,
      })

    it('runs every phase for a registration that is ready on arrival', async () => {
      const saved = { ...registration, state: 'ready' as const }
      const claim = claimOf(saved)
      mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce(claim)

      await expect(complete(saved)).resolves.toBe(saved)

      expect(mockUpdateRegistrations).toHaveBeenCalledWith(saved.eventId)
      expect(mockPublishEventCounts).toHaveBeenCalledWith(recounted)
      expect(mockApplyNewRegistrationStatsOnce).toHaveBeenCalledWith(saved, recounted, 'token')
      expect(mockAuditStrict).toHaveBeenCalledWith(
        { auditKey: `${saved.eventId}:${saved.id}`, message: 'Ilmoittautui', user: 'Test User' },
        saved.createdAt
      )
      expect(mockSendTemplatedMail).toHaveBeenCalledWith(
        'registration',
        'fi',
        expect.any(String),
        ['handler@example.com', 'owner@example.com'],
        expect.objectContaining({ subject: 'Ilmoittautumisen vahvistus' }),
        expect.any(Array)
      )
      expect(mockPublishRegistrationPatchesStrict).toHaveBeenCalledWith(
        saved.eventId,
        [expect.objectContaining({ id: saved.id }), expect.objectContaining({ id: 'other' })],
        'org-1'
      )
      expect(mockPublishPublicStartList).toHaveBeenCalledWith(recounted)
      expect(mockMarkNewRegistrationPhase.mock.calls.map((call) => call[3])).toEqual([
        'newRegistrationAuditAt',
        'newRegistrationEmailSentAt',
        'newRegistrationPublishedAt',
        'newRegistrationProcessedAt',
      ])
      expect(claim.release).toHaveBeenCalledTimes(1)
    })

    it('leaves the counting, the email and the broadcast to the payment of a registration awaiting one', async () => {
      const saved = { ...registration, state: 'creating' as const }
      mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce(claimOf(saved))

      await complete(saved)

      expect(mockApplyNewRegistrationStatsOnce).toHaveBeenCalledWith(saved, confirmedEvent, 'token')
      expect(mockAuditStrict).toHaveBeenCalledTimes(1)
      expect(mockUpdateRegistrations).not.toHaveBeenCalled()
      expect(mockSendTemplatedMail).not.toHaveBeenCalled()
      expect(mockPublishRegistrationPatchesStrict).not.toHaveBeenCalled()
      expect(mockMarkNewRegistrationPhase.mock.calls.map((call) => call[3])).toEqual([
        'newRegistrationAuditAt',
        'newRegistrationProcessedAt',
      ])
    })

    it('records dates that fall outside the event in the audit trail', async () => {
      const saved = { ...registration, dates: [{ date: '2030-01-01T10:00:00.000Z', time: 'ap' as const }] }
      mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce(claimOf(saved))

      await complete(saved)

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Valitut päivät (1.1.2030) eivät ole tapahtuman päiviä' })
      )
    })

    it('skips the phases a previous attempt finished', async () => {
      const saved = {
        ...registration,
        newRegistrationAuditAt: 'done',
        newRegistrationEmailSentAt: 'done',
        newRegistrationStatsAt: 'done',
        state: 'ready' as const,
      }
      mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce(claimOf(saved))

      await complete(saved)

      expect(mockApplyNewRegistrationStatsOnce).not.toHaveBeenCalled()
      expect(mockAuditStrict).not.toHaveBeenCalled()
      expect(mockSendTemplatedMail).not.toHaveBeenCalled()
      expect(mockPublishRegistrationPatchesStrict).toHaveBeenCalledTimes(1)
    })

    it('returns the stored registration untouched when the workflow is done or someone else holds it', async () => {
      const done = { ...registration, newRegistrationProcessedAt: 'done' }
      mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce(claimOf(done))
      await expect(complete(registration)).resolves.toBe(done)

      mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce(undefined)
      await expect(complete(registration)).resolves.toBe(registration)

      expect(mockMarkNewRegistrationPhase).not.toHaveBeenCalled()
    })
  })

  describe('resolveDuplicateRegistration', () => {
    const resolve = (duplicate: JsonRegistration, creationIdempotencyKey?: string) =>
      resolveDuplicateRegistration({
        auditMessage: 'Ilmoittautui',
        confirmedEvent,
        duplicate,
        origin,
        registration: { ...registration, creationIdempotencyKey },
        user,
      })

    it('is a conflict for another request, after broadcasting any group repair', async () => {
      mockRepairReadyRegistrationGroups.mockResolvedValueOnce([{ group: { key: 'reserve', number: 1 }, id: 'moved' }])

      await expect(resolve(registration, 'other-key')).resolves.toEqual({ conflict: registration })

      expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
        registration.eventId,
        [expect.objectContaining({ id: 'moved' })],
        'org-1'
      )
      expect(mockPublishPublicStartList).toHaveBeenCalledWith(recounted)
      expect(mockClaimNewRegistrationPostProcessing).not.toHaveBeenCalled()
    })

    it('broadcasts nothing when the repair moved no one', async () => {
      await resolve(registration, 'other-key')

      expect(mockUpdateRegistrations).not.toHaveBeenCalled()
      expect(mockPublishRegistrationPatches).not.toHaveBeenCalled()
    })

    it('completes the registration for a retry of the same creation', async () => {
      const duplicate = { ...registration, creationIdempotencyKey: 'same-key', newRegistrationProcessedAt: 'done' }
      mockClaimNewRegistrationPostProcessing.mockResolvedValueOnce(claimOf(duplicate))

      await expect(resolve(duplicate, 'same-key')).resolves.toEqual({ completed: duplicate, editToken: 'edit-token' })
    })
  })

  describe('finalizeRegistrationUpdate', () => {
    const finalize = (
      saved: JsonRegistration,
      existing: JsonRegistration,
      flags?: Parameters<typeof finalizeRegistrationUpdate>[0]['flags']
    ) => finalizeRegistrationUpdate({ existing, flags, groupPatches: [], origin, registration: saved, user })

    it('recounts, broadcasts, audits the change and tells the participant', async () => {
      const saved = { ...registration, notes: 'changed' }

      await finalize(saved, registration)

      expect(mockUpdateEventStatsForRegistration).toHaveBeenCalledWith(saved, registration, recounted)
      expect(mockPublishRegistrationPatches).toHaveBeenCalledWith(
        saved.eventId,
        [expect.objectContaining({ id: saved.id, notes: 'changed' })],
        'org-1'
      )
      expect(mockAudit).toHaveBeenCalledWith(expect.objectContaining({ message: 'Muutti: Lisätiedot' }))
      expect(mockClearRegistrationEmailDeliveryStatus).toHaveBeenCalledWith(saved.eventId, saved.id)
      expect(mockSendTemplatedMail).toHaveBeenCalledWith(
        'registration',
        'fi',
        expect.any(String),
        ['handler@example.com', 'owner@example.com'],
        expect.objectContaining({ subject: 'Ilmoittautumisesi tietoja on muokattu' }),
        expect.any(Array)
      )
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Email: Ilmoittautumisesi tietoja on muokattu, to: handler@example.com, owner@example.com',
        })
      )
    })

    it('says on the row when the actor was named from the registration', async () => {
      const saved = { ...registration, notes: 'changed' }

      await finalizeRegistrationUpdate({
        existing: registration,
        groupPatches: [],
        origin,
        registration: saved,
        user: { name: 'Payer Name', source: 'registration' },
      })

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Muutti: Lisätiedot', user: 'Payer Name', userSource: 'registration' })
      )
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Email: Ilmoittautumisesi tietoja on muokattu, to: handler@example.com, owner@example.com',
          user: 'Payer Name',
          userSource: 'registration',
        })
      )
    })

    it('tells the secretary of a cancellation too, by where the dog stood', async () => {
      const saved = { ...registration, cancelled: true, cancelReason: 'dog-heat' }

      await finalize(saved, registration, { cancel: true, confirm: false, invitation: false })

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Ilmoittautuminen peruttiin, syy: Koiran juoksut' })
      )
      expect(mockSendTemplatedMail).toHaveBeenCalledWith(
        'registration',
        'fi',
        expect.any(String),
        ['handler@example.com', 'owner@example.com'],
        expect.objectContaining({ subject: 'Ilmoittautumisesi on peruttu' }),
        expect.any(Array)
      )
      expect(mockSendTemplatedMail).toHaveBeenCalledWith(
        'cancel-early',
        'fi',
        expect.any(String),
        ['secretary@example.com'],
        expect.anything()
      )
    })

    it('records a move to dates outside the class', async () => {
      const saved = { ...registration, dates: [{ date: '2030-01-01T10:00:00.000Z', time: 'ap' as const }] }

      await finalize(saved, registration)

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Valitut päivät (1.1.2030) eivät ole tapahtuman päiviä' })
      )
    })

    it('writes to no one when the registration names no one', async () => {
      const saved = { ...registration, handler: withoutEmail(registration.handler), notes: 'changed' }

      await finalize(saved, { ...registration, handler: withoutEmail(registration.handler) })

      expect(mockSendTemplatedMail).not.toHaveBeenCalled()
      expect(mockPublishRegistrationPatches).toHaveBeenCalledTimes(1)
    })
  })
})
