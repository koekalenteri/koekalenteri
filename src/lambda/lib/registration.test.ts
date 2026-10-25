import type {
  DeepPartial,
  EmailTemplateId,
  JsonConfirmedEvent,
  JsonRegistration,
  RegistrationTemplateContext,
} from '../../types'
import type * as registrationRepository from './repositories/registrationRepository'
import { vi } from 'vitest'
import { eventWithALOClassInvited } from '../../__mockData__/events'
import {
  jsonRegistrationsToEventWithALOInvited,
  jsonRegistrationsToEventWithParticipantsInvited,
  registrationsToEventWithParticipantsInvited,
} from '../../__mockData__/registrations'
import { legacyDayValue } from '../../test-utils/finnishDays'
import { CONFIG } from '../config'

const mockReadRegistration = vi.fn<typeof registrationRepository.readRegistration>()
const mockReadEventRegistrations = vi.fn<typeof registrationRepository.readEventRegistrations>()
const mockWriteRegistrationFields = vi.fn<typeof registrationRepository.writeRegistrationFields>()
const mockUpdateRegistrationField = vi.fn<typeof registrationRepository.updateRegistrationField>()
const mockClearRegistrationEmailDeliveryStatus =
  vi.fn<typeof registrationRepository.clearRegistrationEmailDeliveryStatus>()

vi.doMock('./repositories/registrationRepository', () => ({
  clearRegistrationEmailDeliveryStatus: mockClearRegistrationEmailDeliveryStatus,
  readEventRegistrations: mockReadEventRegistrations,
  readRegistration: mockReadRegistration,
  updateRegistrationField: mockUpdateRegistrationField,
  writeRegistrationFields: mockWriteRegistrationFields,
}))

const mockSendTemplatedMail = vi.fn()
const mockAudit = vi.fn()
const mockEmailTo = vi.fn()
const mockSESSend = vi.fn()

vi.doMock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn(function MockSESClient() {
    return { send: mockSESSend }
  }),
  SendTemplatedEmailCommand: vi.fn(function MockSendTemplatedEmailCommand({ Destination, Template }) {
    return [Destination.ToAddresses, Template]
  }),
}))

vi.doMock('./audit', () => ({
  audit: mockAudit,
  eventAuditKey: vi.fn().mockImplementation((event: { id: string }) => `event:${event.id}`),
  registrationAuditKey: vi
    .fn<(reg: { eventId: string; id: string }) => string>()
    .mockImplementation((reg) => `${reg.eventId}:${reg.id}`),
}))

const {
  applyOwnerOverrides,
  authorizeRegistrationEdit,
  authorizeRegistrationRead,
  deriveRegistrationEditToken,
  getLastEmail,
  findClassesToMark,
  findExistingRegistrationToEventForDog,
  hasRegistrationChanges,
  getRegistration,
  getReadyRegistrationsByEventId,
  groupRegistrationsByClass,
  groupRegistrationsByClassAndGroup,
  createSentRegistrationMessagesAudit,
  recordLastEmail,
  sendTemplatedEmailToEventRegistrations,
  patchRegistration,
  adminRegistrationResponse,
  participantRegistrationResponse,
  publicRegistrationPatch,
  removeRegistrationCreationMetadata,
} = await import('./registration')

/**
 * The grouping and patching tests feed deliberately minimal registrations; the deep-partial
 * fixtures convert to the full json shapes at these named boundaries.
 */
const asJsonRegistration = (reg: DeepPartial<JsonRegistration>) => reg as JsonRegistration
const asJsonRegistrations = (regs: DeepPartial<JsonRegistration>[]) => regs as JsonRegistration[]
const asRegistrationsByClass = (data: Record<string, DeepPartial<JsonRegistration>[]>) =>
  data as Record<string, JsonRegistration[]>
const asRegistrationsByClassAndGroup = (data: Record<string, Record<string, DeepPartial<JsonRegistration>[]>>) =>
  data as Record<string, Record<string, JsonRegistration[]>>

describe('createSentRegistrationMessagesAudit', () => {
  afterEach(() => vi.clearAllMocks())

  it('creates a single-class message with failed recipient details', () => {
    const record = createSentRegistrationMessagesAudit({
      event: { id: 'event-id' },
      failed: ['first@example.com', 'second@example.com'],
      ok: ['success@example.com'],
      registrations: [{ class: 'ALO' }, { class: 'ALO' }],
      template: 'invitation',
      user: 'Test User',
    })

    expect(record).toEqual({
      auditKey: 'event:event-id',
      details: [
        {
          detailKey: 'audit.details.failedRecipients',
          detailParams: { recipients: 'first@example.com\nsecond@example.com' },
        },
      ],
      messageKey: 'audit.messages.classEmailSent',
      messageParams: {
        eventClass: 'ALO',
        failed: 2,
        ok: 1,
        template: 'invitation',
        templateKey: 'emailTemplate.invitation',
      },
      user: 'Test User',
    })
  })

  it('uses the event-level message for multiple classes and omits empty failure details', () => {
    const record = createSentRegistrationMessagesAudit({
      event: { id: 'event-id' },
      failed: [],
      ok: ['success@example.com'],
      registrations: [{ class: 'ALO' }, { class: 'AVO' }, { class: undefined }],
      template: 'picked',
      user: 'Test User',
    })

    expect(record).toEqual({
      auditKey: 'event:event-id',
      messageKey: 'audit.messages.emailSent',
      messageParams: {
        failed: 0,
        ok: 1,
        template: 'picked',
        templateKey: 'emailTemplate.picked',
      },
      user: 'Test User',
    })
  })
})

describe('removeRegistrationCreationMetadata', () => {
  it('removes the retry credential and every new-registration workflow field', () => {
    const registration = {
      creationIdempotencyKey: 'create-secret',
      newRegistrationAuditAt: '2026-01-01T00:00:00.000Z',
      newRegistrationEmailSentAt: '2026-01-01T00:00:00.000Z',
      newRegistrationLease: { expiresAt: 1, token: 'lease' },
      newRegistrationProcessedAt: '2026-01-01T00:00:00.000Z',
      newRegistrationPublishedAt: '2026-01-01T00:00:00.000Z',
      newRegistrationStatsAt: '2026-01-01T00:00:00.000Z',
      notes: 'keep this',
    }

    expect(removeRegistrationCreationMetadata(registration)).toEqual({ notes: 'keep this' })
  })
})

describe('applyOwnerOverrides', () => {
  it('persists the selected owner as handler and payer', () => {
    const data = asJsonRegistration({
      ownerHandles: 'owner-1',
      ownerPays: 'owner-1',
      owners: [{ email: 'a@example.com', key: 'owner-1', name: 'A' }],
    })

    applyOwnerOverrides(data)

    expect(data.handler).toEqual({ email: 'a@example.com', name: 'A' })
    expect(data.payer).toEqual({ email: 'a@example.com', name: 'A' })
  })

  it('persists the owner as handler and payer when the selection is unset (KOE-1598)', () => {
    const data = asJsonRegistration({
      handler: { email: 'h@example.com', name: 'Handler' },
      owners: [{ email: 'a@example.com', key: 'owner-1', name: 'A' }],
      payer: { email: 'p@example.com', name: 'Payer' },
    })

    applyOwnerOverrides(data)

    expect(data.handler).toEqual({ email: 'a@example.com', name: 'A' })
    expect(data.payer).toEqual({ email: 'a@example.com', name: 'A' })
  })

  it('leaves an absent handler/payer key absent, so an unchanged registration stays unchanged', () => {
    const data = asJsonRegistration({
      ownerHandles: false,
      ownerPays: false,
      owners: [{ key: 'owner-1', name: 'A' }],
    })

    applyOwnerOverrides(data)

    expect(Object.hasOwn(data, 'handler')).toBe(false)
    expect(Object.hasOwn(data, 'payer')).toBe(false)
    expect(hasRegistrationChanges({ ...data }, data)).toBe(false)
  })
})

describe('registration', () => {
  beforeAll(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  describe('getLastEmail', () => {
    const reg = JSON.parse(JSON.stringify(registrationsToEventWithParticipantsInvited[6]))
    const sentAt = '2024-08-08T08:32:00.000Z'

    it.each<[EmailTemplateId, RegistrationTemplateContext]>([
      ['access', ''],
      ['invitation', 'invitation'],
      ['picked', ''],
      ['receipt', 'receipt'],
      ['refund', 'refund'],
      ['registration', 'cancel'],
    ])('records what was sent for %s, not a sentence (KOE-1454)', (template, context) => {
      expect(getLastEmail(template, context, reg, sentAt)).toEqual({ context, sentAt, template })
    })

    it('records the reserve place a reserve notification told', () => {
      expect(getLastEmail('reserve', '', reg, sentAt)).toEqual({
        context: '',
        groupNumber: reg.group.number,
        sentAt,
        template: 'reserve',
      })
    })

    it('leaves the reserve place out when the registration has none', () => {
      expect(getLastEmail('reserve', '', { ...reg, group: undefined }, sentAt)).toEqual({
        context: '',
        sentAt,
        template: 'reserve',
      })
    })
  })

  describe('recordLastEmail', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('stores the sent message as a structure the list names in its own language (KOE-1454)', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2023-01-01T12:00:00.000Z'))
      const registration = { ...jsonRegistrationsToEventWithALOInvited[0] }
      const expected = { context: 'cancel', sentAt: '2023-01-01T12:00:00.000Z', template: 'registration' }

      await expect(recordLastEmail(registration, 'registration', 'cancel')).resolves.toEqual(expected)

      expect(mockUpdateRegistrationField).toHaveBeenCalledWith(
        registration.eventId,
        registration.id,
        'lastEmail',
        expected
      )
      expect(registration.lastEmail).toBe(jsonRegistrationsToEventWithALOInvited[0].lastEmail)
    })
  })

  describe('findExistingRegistrationToEventForDog', () => {
    it('should return undefined when dog is not found in existing registrations', async () => {
      mockReadEventRegistrations.mockResolvedValueOnce([])

      expect(await findExistingRegistrationToEventForDog('event-id', 'reg-no')).toBeUndefined()
    })

    it('should return the existing registration when dong is already registered', async () => {
      mockReadEventRegistrations.mockResolvedValueOnce(jsonRegistrationsToEventWithParticipantsInvited)
      const reg = jsonRegistrationsToEventWithParticipantsInvited[0]

      expect(await findExistingRegistrationToEventForDog(reg.eventId, reg.dog.regNo)).toEqual(reg)
    })

    it('should return a payment-pending registration for an idempotent creation retry', async () => {
      const reg = {
        ...jsonRegistrationsToEventWithParticipantsInvited[0],
        creationIdempotencyKey: 'same-attempt',
        state: 'creating' as const,
      }
      mockReadEventRegistrations.mockResolvedValueOnce([reg])

      expect(await findExistingRegistrationToEventForDog(reg.eventId, reg.dog.regNo, 'same-attempt')).toEqual(reg)
    })

    it('should reserve a recent payment-pending registration against a new attempt', async () => {
      const reg = {
        ...jsonRegistrationsToEventWithParticipantsInvited[0],
        createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        creationIdempotencyKey: 'original-attempt',
        state: 'creating' as const,
      }
      mockReadEventRegistrations.mockResolvedValueOnce([reg])

      expect(await findExistingRegistrationToEventForDog(reg.eventId, reg.dog.regNo, 'new-attempt')).toEqual(reg)
    })

    it('should ignore an abandoned payment-pending registration for a new attempt', async () => {
      const reg = {
        ...jsonRegistrationsToEventWithParticipantsInvited[0],
        createdAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
        creationIdempotencyKey: 'original-attempt',
        state: 'creating' as const,
      }
      mockReadEventRegistrations.mockResolvedValueOnce([reg])

      expect(await findExistingRegistrationToEventForDog(reg.eventId, reg.dog.regNo, 'new-attempt')).toBeUndefined()
    })
  })

  describe('getReadyRegistrationsByEventId', () => {
    it('should return empty array when no registrations exist', async () => {
      mockReadEventRegistrations.mockResolvedValueOnce([])

      const result = await getReadyRegistrationsByEventId('event-id')

      expect(result).toEqual([])
    })

    it('should return only ready registrations', async () => {
      const registrations: DeepPartial<JsonRegistration>[] = [
        { eventId: 'event-id', id: 'reg1', state: 'ready' },
        { eventId: 'event-id', id: 'reg2', state: 'creating' },
        { eventId: 'event-id', id: 'reg3', state: 'ready' },
        { eventId: 'event-id', id: 'reg4', state: 'creating' },
      ]
      mockReadEventRegistrations.mockResolvedValueOnce(asJsonRegistrations(registrations))

      const result = await getReadyRegistrationsByEventId('event-id')

      expect(result).toHaveLength(2)
      expect(result.every((r) => r.state === 'ready')).toBe(true)
      expect(result.map((r) => r.id)).toEqual(['reg1', 'reg3'])
    })

    it('should return empty array when all registrations are non-ready', async () => {
      const registrations: DeepPartial<JsonRegistration>[] = [
        { eventId: 'event-id', id: 'reg1', state: 'creating' },
        { eventId: 'event-id', id: 'reg2', state: 'creating' },
      ]
      mockReadEventRegistrations.mockResolvedValueOnce(asJsonRegistrations(registrations))

      const result = await getReadyRegistrationsByEventId('event-id')

      expect(result).toEqual([])
    })
  })

  describe('groupRegistrationsByClass', () => {
    it('should group registrations by class', () => {
      const registrations = asJsonRegistrations([
        { class: 'ALO', id: '1' },
        { class: 'AVO', id: '2' },
        { class: 'ALO', id: '3' },
      ])

      const result = groupRegistrationsByClass(registrations)

      expect(Object.keys(result)).toEqual(['ALO', 'AVO'])
      expect(result.ALO).toHaveLength(2)
      expect(result.AVO).toHaveLength(1)
      expect(result.ALO).toContainEqual(expect.objectContaining({ id: '1' }))
      expect(result.ALO).toContainEqual(expect.objectContaining({ id: '3' }))
      expect(result.AVO).toContainEqual(expect.objectContaining({ id: '2' }))
    })

    it('should use eventType when class is not available', () => {
      const registrations = asJsonRegistrations([
        { eventType: 'NOME', id: '1' },
        { class: 'AVO', id: '2' },
        { eventType: 'NOME', id: '3' },
      ])

      const result = groupRegistrationsByClass(registrations)

      expect(Object.keys(result)).toEqual(['NOME', 'AVO'])
      expect(result.NOME).toHaveLength(2)
      expect(result.AVO).toHaveLength(1)
    })

    it('should handle empty array', () => {
      const result = groupRegistrationsByClass([])
      expect(result).toEqual({})
    })
  })

  describe('groupRegistrationsByClassAndGroup', () => {
    it('should group registrations by class and group', () => {
      const registrationsByClass = asRegistrationsByClass({
        ALO: [
          { group: { key: 'group1' }, id: '1' },
          { group: { key: 'group2' }, id: '2' },
          { group: { key: 'group1' }, id: '3' },
        ],
        AVO: [{ group: { key: 'group3' }, id: '4' }],
      })

      const result = groupRegistrationsByClassAndGroup(registrationsByClass)

      expect(Object.keys(result)).toEqual(['ALO', 'AVO'])
      expect(Object.keys(result.ALO)).toEqual(['group1', 'group2'])
      expect(Object.keys(result.AVO)).toEqual(['group3'])
      expect(result.ALO.group1).toHaveLength(2)
      expect(result.ALO.group2).toHaveLength(1)
    })

    it('should skip registrations that are not in participant groups', () => {
      const registrationsByClass = asRegistrationsByClass({
        ALO: [
          { group: { key: 'group1' }, id: '1' },
          { group: { key: 'reserve' }, id: '2' },
          { group: { key: 'cancelled' }, id: '3' },
          { group: undefined, id: '4' },
        ],
      })

      const result = groupRegistrationsByClassAndGroup(registrationsByClass)

      expect(Object.keys(result.ALO)).toEqual(['group1'])
      expect(result.ALO.group1).toHaveLength(1)
    })

    it('skips a cancelled registration still placed in a participant group (KOE-1537)', () => {
      const registrationsByClass = asRegistrationsByClass({
        ALO: [
          { group: { key: '2026-10-20-kp' }, id: '1', messagesSent: { invitation: true } },
          { cancelled: true, group: { key: '2026-10-20-kp' }, id: '2' },
        ],
      })

      const result = groupRegistrationsByClassAndGroup(registrationsByClass)

      expect(result.ALO['2026-10-20-kp'].map((r) => r.id)).toEqual(['1'])
      expect(findClassesToMark(result, 'invitation')).toEqual(['ALO'])
    })

    it('should handle empty input', () => {
      const result = groupRegistrationsByClassAndGroup({})
      expect(result).toEqual({})
    })
  })

  describe('findClassesToMark', () => {
    it('should find classes where all groups have received the message', () => {
      const registrationsByClassAndGroup = asRegistrationsByClassAndGroup({
        ALO: {
          group1: [
            { id: '1', messagesSent: { invitation: true } },
            { id: '2', messagesSent: { invitation: true } },
          ],
          group2: [{ id: '3', messagesSent: { invitation: true } }],
        },
        AVO: {
          group3: [{ id: '4', messagesSent: { invitation: true } }],
        },
        VOI: {
          group4: [{ id: '5', messagesSent: { invitation: false } }],
        },
      })

      const result = findClassesToMark(registrationsByClassAndGroup, 'invitation')

      expect(result).toEqual(['ALO', 'AVO'])
    })

    it('should not include classes with empty groups', () => {
      const registrationsByClassAndGroup = asRegistrationsByClassAndGroup({
        ALO: {},
        AVO: {
          group1: [{ id: '1', messagesSent: { invitation: true } }],
        },
      })

      const result = findClassesToMark(registrationsByClassAndGroup, 'invitation')

      expect(result).toEqual(['AVO'])
    })

    it('should handle missing messagesSent property', () => {
      const registrationsByClassAndGroup = asRegistrationsByClassAndGroup({
        ALO: {
          group1: [
            { id: '1', messagesSent: { invitation: true } },
            { id: '2' }, // Missing messagesSent
          ],
        },
      })

      const result = findClassesToMark(registrationsByClassAndGroup, 'invitation')

      expect(result).toEqual([])
    })

    it('should handle empty input', () => {
      const result = findClassesToMark({}, 'invitation')
      expect(result).toEqual([])
    })
  })

  describe('hasRegistrationChanges', () => {
    it('returns false when only modified fields change', () => {
      const existing = JSON.parse(
        JSON.stringify({
          ...registrationsToEventWithParticipantsInvited[0],
          modifiedAt: '2024-01-01T10:00:00.000Z',
          modifiedBy: 'first-user',
        })
      ) as JsonRegistration
      const updated = {
        ...existing,
        modifiedAt: '2024-01-01T11:00:00.000Z',
        modifiedBy: 'second-user',
      } as JsonRegistration

      expect(hasRegistrationChanges(existing, updated)).toBe(false)
    })

    it('returns true when a meaningful registration field changes', () => {
      const existing = JSON.parse(JSON.stringify(registrationsToEventWithParticipantsInvited[0])) as JsonRegistration
      const updated = {
        ...existing,
        confirmed: true,
      } as JsonRegistration

      expect(hasRegistrationChanges(existing, updated)).toBe(true)
    })

    // The dog's dates compare by day, whichever form each side stores them in (KOE-1548).
    describe("the dog's dates", () => {
      const stored: JsonRegistration = JSON.parse(JSON.stringify(registrationsToEventWithParticipantsInvited[0]))
      // The fixture's own birth date is left out, so a missing one is missing.
      const { dob: _dob, ...dogWithoutDob } = stored.dog
      const base: JsonRegistration = { ...stored, dog: dogWithoutDob }
      const result = (date: string) => ({
        class: 'ALO',
        date: legacyDayValue(date),
        judge: 'J',
        location: 'L',
        result: 'ALO1',
        type: 'NOME-B',
      })
      const withDates = ({
        dob,
        official,
        qualifying,
        manual,
      }: Record<string, string | undefined>): JsonRegistration => ({
        ...base,
        dog: {
          ...base.dog,
          ...(dob === undefined ? {} : { dob: legacyDayValue(dob) }),
          results: official === undefined ? [] : [result(official)],
        },
        qualifyingResults: qualifying === undefined ? [] : [{ ...result(qualifying), official: true }],
        results: manual === undefined ? [] : [{ ...result(manual), id: 'm1' }],
      })
      const differ = (a: Record<string, string | undefined>, b: Record<string, string | undefined>) =>
        hasRegistrationChanges(withDates(a), withDates(b))

      it.each([
        ['the birth date', 'dob'],
        ['an official result', 'official'],
        ['a qualifying result', 'qualifying'],
        ['a hand-entered result', 'manual'],
      ])('reads %s stored as a stamp or an instant and sent as a key as no change', (_name, field) => {
        expect(differ({ [field]: '2021-01-01T00:00:00' }, { [field]: '2021-01-01' })).toBe(false)
        expect(differ({ [field]: '2020-12-31T22:00:00.000Z' }, { [field]: '2021-01-01' })).toBe(false)
        expect(differ({ [field]: '2021-01-01' }, { [field]: '2021-01-02' })).toBe(true)
      })

      // Kennelliitto's empty date in its stored forms, and none at all: one "no day", not a change.
      it.each(['0001-01-01T00:00:00', '0001-01-01T00:00:00.000Z', '0000-12-31T22:00:00.000Z'])(
        'reads an empty date of %s against none as no change',
        (empty) => {
          expect(differ({ dob: empty }, { dob: undefined })).toBe(false)
          expect(differ({ official: empty }, { official: '' })).toBe(false)
          expect(differ({ qualifying: empty }, { qualifying: '' })).toBe(false)
        }
      )

      it('reads a value with no day against a day, or two different ones, as a change', () => {
        expect(differ({ dob: 'unknown' }, { dob: '2021-01-01' as const })).toBe(true)
        expect(differ({ dob: 'unknown' }, { dob: 'not known' })).toBe(true)
        expect(differ({ official: '0001-01-01T00:00:00' }, { official: '2021-01-01' })).toBe(true)
        expect(differ({ dob: undefined }, { dob: '2021-01-01' as const })).toBe(true)
      })
    })
  })

  describe('getRegistration', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('reads eventually consistent by default', async () => {
      const registration = asJsonRegistration({ eventId: 'event-id', id: 'reg-id' })
      mockReadRegistration.mockResolvedValueOnce(registration)

      await expect(getRegistration('event-id', 'reg-id')).resolves.toBe(registration)

      expect(mockReadRegistration).toHaveBeenCalledWith('event-id', 'reg-id', false)
    })

    // Every writer that just changed the row and must publish its current state asks for this
    // (KOE-1529): an eventually consistent read could still answer with the row from before the
    // write.
    it('reads strongly consistently when asked', async () => {
      mockReadRegistration.mockResolvedValueOnce(asJsonRegistration({ eventId: 'event-id', id: 'reg-id' }))

      await getRegistration('event-id', 'reg-id', true)

      expect(mockReadRegistration).toHaveBeenCalledWith('event-id', 'reg-id', true)
    })

    it('throws a 404 when the registration does not exist', async () => {
      mockReadRegistration.mockResolvedValueOnce(undefined)

      await expect(getRegistration('event-id', 'missing-id')).rejects.toMatchObject({ status: 404 })
    })
  })

  describe('patchRegistration', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('updates only changed fields and reloads the registration', async () => {
      const existing = asJsonRegistration({
        dog: { name: 'Old name', regNo: 'REG-1' },
        emailDeliveryStatus: { status: 'bounce' },
        eventId: 'event-id',
        id: 'reg-id',
        notes: 'old',
      })
      const next = asJsonRegistration({
        ...existing,
        dog: { name: 'New name', regNo: 'REG-1' },
        emailDeliveryStatus: undefined,
        notes: 'new',
      })
      mockReadRegistration.mockResolvedValueOnce(next)

      const result = await patchRegistration(existing.eventId, existing.id, existing, next)

      expect(mockWriteRegistrationFields).toHaveBeenCalledWith('event-id', 'reg-id', {
        remove: ['emailDeliveryStatus'],
        set: {
          'dog.name': 'New name',
          notes: 'new',
        },
      })
      expect(mockReadRegistration).toHaveBeenCalledWith('event-id', 'reg-id', false)
      expect(result).toEqual(next)
    })

    it('does nothing for no-op patches', async () => {
      const existing = asJsonRegistration({ eventId: 'event-id', id: 'reg-id', notes: 'old' })

      const result = await patchRegistration(existing.eventId, existing.id, existing, { ...existing })

      expect(mockWriteRegistrationFields).not.toHaveBeenCalled()
      expect(mockReadRegistration).not.toHaveBeenCalled()
      expect(result).toBe(existing)
    })
  })

  describe('sendTemplatedEmailToEventRegistrations', () => {
    // These tests are about the mail itself; outside prod it would go to staff only (KOE-1469)
    const stageName = CONFIG.stageName
    beforeAll(() => {
      CONFIG.stageName = 'prod'
    })
    afterAll(() => {
      CONFIG.stageName = stageName
    })

    beforeEach(() => {
      vi.clearAllMocks()

      // Setup default mock implementations
      mockEmailTo.mockImplementation((reg: JsonRegistration) => {
        const emails = [reg.handler?.email]
        if (reg.owner?.email !== reg.handler?.email) {
          emails.push(reg.owner?.email)
        }
        return emails
      })

      mockSendTemplatedMail.mockResolvedValue(undefined)
    })

    it('should send emails to all registrations successfully', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2023-01-01 12:00Z'))
      const result = await sendTemplatedEmailToEventRegistrations(
        'invitation',
        { ...JSON.parse(JSON.stringify(eventWithALOClassInvited)), invitationAttachments: { ALO: 'alo-attachment' } },
        [
          { ...jsonRegistrationsToEventWithALOInvited[0] },
          { ...jsonRegistrationsToEventWithALOInvited[1], language: 'en' },
        ],
        'https://example.com',
        'Test message',
        { name: 'admin-user' },
        ''
      )

      // Check result
      expect(result).toEqual({
        failed: [],
        ok: ['handler1@example.com', 'owner1@example.com', 'handler2@example.com', 'owner2@example.com'],
      })

      // Check email sending
      expect(mockSESSend).toHaveBeenCalledTimes(2)
      expect(mockSESSend).toHaveBeenCalledWith([['handler1@example.com', 'owner1@example.com'], 'invitation-local-fi'])
      expect(mockSESSend).toHaveBeenCalledWith([['handler2@example.com', 'owner2@example.com'], 'invitation-local-en'])

      // Check audit entries
      expect(mockAudit).toHaveBeenCalledTimes(2)
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'testALOInvited:testALOInvited1',
        messageKey: 'audit.messages.emailSentTo',
        messageParams: {
          recipients: 'handler1@example.com, owner1@example.com',
          templateKey: 'emailTemplate.invitation',
        },
        user: 'admin-user',
      })

      // The previous delivery status goes before the send (a bounce of the new one sets it again)
      expect(mockClearRegistrationEmailDeliveryStatus).toHaveBeenCalledWith('testALOInvited', 'testALOInvited1')

      // Check lastEmail updates
      expect(mockUpdateRegistrationField).toHaveBeenCalledWith('testALOInvited', 'testALOInvited1', 'lastEmail', {
        context: '',
        sentAt: '2023-01-01T12:00:00.000Z',
        template: 'invitation',
      })

      // Check messagesSent updates
      expect(mockUpdateRegistrationField).toHaveBeenCalledWith('testALOInvited', 'testALOInvited1', 'messagesSent', {
        invitation: true,
      })
      expect(mockWriteRegistrationFields).toHaveBeenCalledWith('testALOInvited', 'testALOInvited1', {
        set: {
          invitationAttachmentSent: 'alo-attachment',
          updatedAt: expect.any(String),
        },
      })

      vi.useRealTimers()
    })

    it('names a cancellation by the secretary as a cancellation in the message column (KOE-1455)', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2023-01-01 12:00Z'))
      const registration = { ...jsonRegistrationsToEventWithALOInvited[0], cancelled: true }

      await sendTemplatedEmailToEventRegistrations(
        'registration',
        JSON.parse(JSON.stringify(eventWithALOClassInvited)),
        [registration],
        'https://example.com',
        '',
        { name: 'admin-user' },
        'cancel'
      )

      expect(mockUpdateRegistrationField).toHaveBeenCalledWith('testALOInvited', 'testALOInvited1', 'lastEmail', {
        context: 'cancel',
        sentAt: '2023-01-01T12:00:00.000Z',
        template: 'registration',
      })
      // The trail names it by the cancellation subject's key too (KOE-1442).
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          messageKey: 'audit.messages.emailSentTo',
          messageParams: expect.objectContaining({ templateKey: 'registration.email.subject_cancel' }),
        })
      )
      vi.useRealTimers()
    })

    it('records the common invitation attachment when class attachment is not configured', async () => {
      const registration = { ...jsonRegistrationsToEventWithALOInvited[2] }

      await sendTemplatedEmailToEventRegistrations(
        'invitation',
        {
          ...JSON.parse(JSON.stringify(eventWithALOClassInvited)),
          invitationAttachment: 'common-attachment',
          invitationAttachments: { ALO: 'alo-attachment' },
        },
        [registration],
        'https://example.com',
        'Test message',
        { name: 'admin-user' },
        ''
      )

      expect(mockWriteRegistrationFields).toHaveBeenCalledWith(registration.eventId, registration.id, {
        set: {
          invitationAttachmentSent: 'common-attachment',
          updatedAt: expect.any(String),
        },
      })
      expect(registration.invitationAttachmentSent).toBe('common-attachment')
    })

    it('preserves a legacy receipt for the previously sent attachment when resending', async () => {
      const registration = {
        ...jsonRegistrationsToEventWithALOInvited[0],
        invitationAttachmentSent: 'old-attachment',
        invitationRead: true,
        messagesSent: { invitation: true },
      }

      await sendTemplatedEmailToEventRegistrations(
        'invitation',
        { ...JSON.parse(JSON.stringify(eventWithALOClassInvited)), invitationAttachments: { ALO: 'new-attachment' } },
        [registration],
        'https://example.com',
        'Test message',
        { name: 'admin-user' },
        ''
      )

      expect(mockWriteRegistrationFields).toHaveBeenCalledWith(registration.eventId, registration.id, {
        set: {
          invitationAttachmentRead: 'old-attachment',
          invitationAttachmentSent: 'new-attachment',
          updatedAt: expect.any(String),
        },
      })
      expect(registration.invitationAttachmentRead).toBe('old-attachment')
      expect(registration.invitationAttachmentSent).toBe('new-attachment')
    })

    it('does not treat a newly sent attachment as read when a legacy receipt has no attachment key', async () => {
      const registration = {
        ...jsonRegistrationsToEventWithALOInvited[0],
        invitationRead: true,
        messagesSent: { invitation: true },
      }

      await sendTemplatedEmailToEventRegistrations(
        'invitation',
        { ...JSON.parse(JSON.stringify(eventWithALOClassInvited)), invitationAttachments: { ALO: 'new-attachment' } },
        [registration],
        'https://example.com',
        'Test message',
        { name: 'admin-user' },
        ''
      )

      expect(mockWriteRegistrationFields).toHaveBeenCalledWith(registration.eventId, registration.id, {
        set: {
          invitationAttachmentSent: 'new-attachment',
          invitationRead: false,
          updatedAt: expect.any(String),
        },
      })
      expect(registration.invitationRead).toBe(false)
    })

    it('sends to one registration at a time, in order, for the SES send rate', async () => {
      let releaseFirst: () => void = () => undefined
      mockSESSend.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = resolve
          })
      )

      const sending = sendTemplatedEmailToEventRegistrations(
        'invitation',
        JSON.parse(JSON.stringify(eventWithALOClassInvited)),
        jsonRegistrationsToEventWithALOInvited.slice(0, 2).map((r) => ({ ...r })),
        'https://example.com',
        'Test message',
        { name: 'admin-user' },
        ''
      )

      await vi.waitFor(() => expect(mockSESSend).toHaveBeenCalledTimes(1))
      // A turn of the event loop in which a parallel send would have started.
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(mockSESSend).toHaveBeenCalledTimes(1)

      releaseFirst()
      await expect(sending).resolves.toEqual({
        failed: [],
        ok: ['handler1@example.com', 'owner1@example.com', 'handler2@example.com', 'owner2@example.com'],
      })
      expect(mockSESSend).toHaveBeenNthCalledWith(1, [
        ['handler1@example.com', 'owner1@example.com'],
        expect.any(String),
      ])
      expect(mockSESSend).toHaveBeenNthCalledWith(2, [
        ['handler2@example.com', 'owner2@example.com'],
        expect.any(String),
      ])
    })

    it('should handle failed email sending', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      // Make the second email fail
      mockSESSend.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Email sending failed'))

      const result = await sendTemplatedEmailToEventRegistrations(
        'invitation',
        JSON.parse(JSON.stringify(eventWithALOClassInvited)),
        jsonRegistrationsToEventWithALOInvited.slice(0, 2).map((r) => ({ ...r })),
        'https://example.com',
        'Test message',
        { name: 'admin-user' },
        ''
      )

      expect(mockSESSend).toHaveBeenCalledTimes(2)

      // Check result
      expect(result).toEqual({
        failed: ['handler2@example.com', 'owner2@example.com'],
        ok: ['handler1@example.com', 'owner1@example.com'],
      })

      // Check audit entries for failure
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'testALOInvited:testALOInvited2',
        messageKey: 'audit.messages.emailFailedTo',
        messageParams: {
          recipients: 'handler2@example.com, owner2@example.com',
          templateKey: 'emailTemplate.invitation',
        },
        user: 'admin-user',
      })

      // Check that messagesSent was not updated for the failed email
      expect(mockUpdateRegistrationField).not.toHaveBeenCalledWith(
        'testALOInvited',
        'testALOInvited2',
        'messagesSent',
        expect.anything()
      )
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('should update existing messagesSent property', async () => {
      // Registration with existing messagesSent property
      const registrationWithExistingMessages = {
        ...jsonRegistrationsToEventWithALOInvited[0],
        messagesSent: { registration: true },
      }

      await sendTemplatedEmailToEventRegistrations(
        'invitation',
        JSON.parse(JSON.stringify(eventWithALOClassInvited)),
        [registrationWithExistingMessages],
        'https://example.com',
        'Test message',
        { name: 'admin-user' },
        ''
      )

      // Check that messagesSent was properly updated
      expect(mockUpdateRegistrationField).toHaveBeenCalledWith('testALOInvited', 'testALOInvited1', 'messagesSent', {
        invitation: true,
        registration: true,
      })

      // Check that the in-memory object was updated
      expect(registrationWithExistingMessages.messagesSent).toEqual({
        invitation: true,
        registration: true,
      })
    })

    it('should handle reserve template with group number', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2023-01-01 12:00Z'))

      await sendTemplatedEmailToEventRegistrations(
        'reserve',
        JSON.parse(JSON.stringify(eventWithALOClassInvited)),
        [jsonRegistrationsToEventWithALOInvited[0]],
        'https://example.com',
        'Test message',
        { name: 'admin-user' },
        ''
      )

      // Check lastEmail format for reserve template
      expect(mockUpdateRegistrationField).toHaveBeenCalledWith('testALOInvited', 'testALOInvited1', 'lastEmail', {
        context: '',
        groupNumber: 1,
        sentAt: '2023-01-01T12:00:00.000Z',
        template: 'reserve',
      })

      expect(mockUpdateRegistrationField).toHaveBeenCalledWith('testALOInvited', 'testALOInvited1', 'messagesSent', {
        reserve: true,
      })

      vi.useRealTimers()
    })
  })
})

describe('registration access', () => {
  const registration = { editTokenVersion: 1, eventId: 'event', id: 'registration' }
  const secret = 'test-registration-edit-token-secret'

  it('authorizes only the matching bearer token', () => {
    const token = deriveRegistrationEditToken(registration, secret)

    expect(authorizeRegistrationEdit({ headers: { authorization: `Bearer ${token}` } }, registration)).toBe(token)
    expect(() => authorizeRegistrationEdit({ headers: {} }, registration)).toThrow('404 not found')
    expect(() =>
      authorizeRegistrationEdit({ headers: { Authorization: 'Bearer another-secret' } }, registration)
    ).toThrow('404 not found')
  })

  it('reads the edit token from its own header when Authorization carries a login', () => {
    const token = deriveRegistrationEditToken(registration, secret)

    expect(
      authorizeRegistrationEdit(
        { headers: { Authorization: 'Bearer cognito-id-token', 'x-registration-token': token } },
        registration
      )
    ).toBe(token)
    expect(() => authorizeRegistrationEdit({ headers: { 'X-Registration-Token': `${token}x` } }, registration)).toThrow(
      '404 not found'
    )
  })

  it('allows a tokenless read only for a legacy registration', () => {
    const legacyRegistration = { eventId: registration.eventId, id: registration.id }
    const expected = deriveRegistrationEditToken(legacyRegistration, secret)

    expect(authorizeRegistrationRead({ headers: {} }, legacyRegistration)).toBe(expected)
    expect(() => authorizeRegistrationRead({ headers: {} }, registration)).toThrow('404 not found')
    expect(() =>
      authorizeRegistrationRead({ headers: { Authorization: 'Bearer invalid' } }, legacyRegistration)
    ).toThrow('404 not found')
  })

  it('derives one stable token until its version is changed', () => {
    const token = deriveRegistrationEditToken(registration, secret)

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(deriveRegistrationEditToken(registration, secret)).toBe(token)
    expect(deriveRegistrationEditToken({ ...registration, editTokenVersion: 2 }, secret)).not.toBe(token)
  })

  it('drops privileged and workflow metadata from public patches', () => {
    const patch = publicRegistrationPatch(
      {
        creationIdempotencyKey: 'attacker-controlled-key',
        eventId: 'event',
        group: { key: 'picked', number: 1 },
        id: 'registration',
        internalNotes: 'secretary note',
        notes: 'participant note',
        paidAmount: 0,
        priorityByInvitation: true,
        qualifies: true,
        qualifyingResults: [],
        refundAmount: 100,
        selectedCost: 'normal',
        state: 'ready',
      },
      true
    )

    expect(patch).toEqual({
      eventId: 'event',
      id: 'registration',
      notes: 'participant note',
      selectedCost: 'normal',
    })
  })

  it('allows only one-way participant workflow transitions', () => {
    expect(
      publicRegistrationPatch(
        { cancelled: false, cancelReason: 'reason', confirmed: false, invitationRead: false },
        true
      )
    ).toEqual({})
    expect(
      publicRegistrationPatch({ cancelled: true, cancelReason: 'reason', confirmed: true, invitationRead: true }, true)
    ).toEqual({ cancelled: true, cancelReason: 'reason', confirmed: true, invitationRead: true })
  })

  // A stored row and its trial, as the handlers have them (paid at entry, the fee unpaid).
  const participantEvent: JsonConfirmedEvent = JSON.parse(JSON.stringify(eventWithALOClassInvited))
  const storedRow = { ...jsonRegistrationsToEventWithALOInvited[0], paidAmount: undefined, paymentStatus: undefined }

  it('never returns the stored token version to a participant', () => {
    const response = participantRegistrationResponse(
      { ...storedRow, editTokenVersion: 3 },
      'raw-token',
      participantEvent,
      []
    )
    expect(response).toMatchObject({ editToken: 'raw-token', id: storedRow.id })
    expect(response).not.toHaveProperty('editTokenVersion')
  })

  describe('the fields only the secretary sees', () => {
    const group = { date: '2026-08-01' as const, key: '2026-08-01-ap', number: 3, time: 'ap' as const }
    const stored = {
      ...storedRow,
      editTokenVersion: 3,
      eventResult: { result: 'AVO1', updatedAt: '2026-08-01T12:00:00.000Z', updatedBy: 'Secretary' },
      group,
      id: 'registration',
      internalNotes: 'call the owner',
      kcResult: {
        at: '2026-08-01T13:00:00.000Z',
        by: 'Secretary',
        payloadHash: 'h',
        status: 'sent' as const,
        tulosId: 5,
      },
      startGroup: { ...group, number: 7 },
    }

    it('leaves the result, the notes, the groups and the open ids out of the participant response, but says a payment is in progress (KOE-1515, KOE-1529)', () => {
      // The caller (participantResponse in lib/payment.ts) has loaded the open payments by the time
      // this function runs: the open ids are never sent, but what they say is.
      const withOpenTransactions = { ...stored, openPayments: ['transaction-1'], openRefunds: ['refund-1'] }
      const fresh = { createdAt: new Date().toISOString(), status: 'pending' as const, type: 'payment' as const }
      const response = participantRegistrationResponse(withOpenTransactions, 'raw-token', participantEvent, [fresh])
      for (const field of [
        'eventResult',
        'group',
        'internalNotes',
        'kcResult',
        'startGroup',
        'openPayments',
        'openRefunds',
      ]) {
        expect(response).not.toHaveProperty(field)
      }
      expect(response).toMatchObject({ payment: { canPay: false, status: 'inProgress' } })
    })

    // The state is worked out here from the same row, so it reads the group it leaves out: a reserve
    // whose fee went back owes nothing, the same row in a place owes the fee again.
    it('says what is still owed in place of the group it was worked out from (KOE-1526)', () => {
      const returned = { ...stored, paidAmount: 50, paymentStatus: 'SUCCESS' as const, refundAmount: 50 }
      const fee = { ...participantEvent, cost: 50, costMember: 50 }
      expect(
        participantRegistrationResponse({ ...returned, group: { key: 'reserve', number: 1 } }, 'raw-token', fee, [])
      ).toMatchObject({ payment: { canPay: false, due: 0, status: 'refunded' } })
      expect(participantRegistrationResponse(returned, 'raw-token', fee, [])).toMatchObject({
        payment: { canPay: true, due: 50, status: 'unpaid' },
      })
    })

    it('keeps them in the admin response', () => {
      expect(adminRegistrationResponse(stored, 'raw-token')).toMatchObject({
        editToken: 'raw-token',
        eventResult: { result: 'AVO1', updatedAt: '2026-08-01T12:00:00.000Z', updatedBy: 'Secretary' },
        group,
        id: 'registration',
        internalNotes: 'call the owner',
        startGroup: { ...group, number: 7 },
      })
    })
  })
})
