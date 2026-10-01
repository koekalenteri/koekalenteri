import { vi } from 'vitest'
import { jsonRegistrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import { loggedLines } from '../test-utils/logs'

const mockSend = vi.fn<() => Promise<void>>()
const mockQuery = vi.fn<(params: { values: Record<string, string> }) => Promise<unknown[] | undefined>>()
const mockAudit = vi.fn()

vi.doMock('../utils/CustomDynamoClient', () => ({
  default: vi.fn(function MockCustomDynamoClient() {
    return { query: mockQuery }
  }),
}))

vi.doMock('./audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./audit')>()),
  audit: mockAudit,
}))

vi.doMock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn(function MockSESClient() {
    return { send: mockSend }
  }),
  SendTemplatedEmailCommand: vi.fn(function MockSendTemplatedEmailCommand(input) {
    return { input }
  }),
}))

const { CONFIG } = await import('../config')
const { __resetStaffAddressCache, emailTo, registrationEmailTags, sendTemplatedMail, withoutPlusTag } = await import(
  './email'
)

const users: Record<string, unknown[]> = {
  'admin@example.com': [{ admin: true, email: 'admin@example.com' }],
  'deleted@example.com': [{ admin: true, deletedAt: '2026-01-01T00:00:00.000Z', email: 'deleted@example.com' }],
  'former@example.com': [{ email: 'former@example.com', roles: { 'org-1': undefined } }],
  'participant@example.com': [{ email: 'participant@example.com' }],
  'secretary@example.com': [{ email: 'secretary@example.com', roles: { 'org-1': 'secretary' } }],
}

describe('email', () => {
  const stageName = CONFIG.stageName

  beforeEach(() => {
    vi.clearAllMocks()
    __resetStaffAddressCache()
    CONFIG.stageName = 'prod'
    mockSend.mockResolvedValue(undefined)
    mockQuery.mockImplementation(async ({ values }) => users[values[':email']] ?? [])
  })

  afterAll(() => {
    CONFIG.stageName = stageName
  })

  it('logs delivery metadata without sender or recipient addresses', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await sendTemplatedMail('registration', 'fi', 'sender@example.com', ['first@example.com', 'second@example.com'], {})

    expect(loggedLines(infoSpy)).toContainEqual(
      expect.objectContaining({ message: 'sending email', recipientCount: 2, template: 'registration' })
    )
    expect(mockSend).toHaveBeenCalledTimes(1)
  })

  describe('outside prod (KOE-1469)', () => {
    const sentTo = (addresses: string[]) =>
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ input: expect.objectContaining({ Destination: { ToAddresses: addresses } }) })
      )

    beforeEach(() => {
      CONFIG.stageName = 'test'
    })

    it('delivers to admins and role holders, also at their plus-addresses', async () => {
      await sendTemplatedMail(
        'registration',
        'fi',
        'sender@example.com',
        ['Admin@Example.com', 'secretary@example.com', 'admin+kk-7f3a9c@example.com'],
        {}
      )

      sentTo(['Admin@Example.com', 'secretary@example.com', 'admin+kk-7f3a9c@example.com'])
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('drops everyone else and records it on the registration', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

      await sendTemplatedMail(
        'invitation',
        'fi',
        'sender@example.com',
        [
          'participant@example.com',
          'stranger@example.com',
          'deleted@example.com',
          'former@example.com',
          'admin@example.com',
        ],
        {},
        [
          { Name: 'eventId', Value: 'event-1' },
          { Name: 'registrationId', Value: 'reg-1' },
        ]
      )

      sentTo(['admin@example.com'])
      expect(mockAudit).toHaveBeenCalledWith({
        auditKey: 'event-1:reg-1',
        message: 'Viesti estetty testiympäristössä (4 vastaanottajaa)',
        user: 'system',
      })
      expect(loggedLines(infoSpy)).toContainEqual(
        expect.objectContaining({ blockedCount: 4, message: 'email recipients blocked outside prod' })
      )
      expect(infoSpy).not.toHaveBeenCalledWith(expect.stringContaining('participant@example.com'))
    })

    it('sends nothing when nobody is left', async () => {
      await sendTemplatedMail('cancel-early', 'fi', 'sender@example.com', ['stranger@example.com'], {})

      expect(mockSend).not.toHaveBeenCalled()
      // Mail without registration tags (the secretary's cancellation notice, access) has nowhere to record it
      expect(mockAudit).not.toHaveBeenCalled()
    })

    it('does not treat a plus-address of a non-staff user as staff', async () => {
      await sendTemplatedMail('registration', 'fi', 'sender@example.com', ['participant+kk-1@example.com'], {})

      expect(mockSend).not.toHaveBeenCalled()
    })

    it('looks an address up once per lambda instance', async () => {
      await sendTemplatedMail('registration', 'fi', 'sender@example.com', ['admin@example.com'], {})
      await sendTemplatedMail('registration', 'fi', 'sender@example.com', ['admin@example.com'], {})

      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockSend).toHaveBeenCalledTimes(2)
    })

    it('delivers to everyone in prod without looking anyone up', async () => {
      CONFIG.stageName = 'prod'

      await sendTemplatedMail('registration', 'fi', 'sender@example.com', ['stranger@example.com'], {})

      sentTo(['stranger@example.com'])
      expect(mockQuery).not.toHaveBeenCalled()
    })

    it('delivers to the SES mailbox simulator without looking it up (KOE-1381)', async () => {
      await sendTemplatedMail(
        'registration',
        'fi',
        'sender@example.com',
        ['bounce@simulator.amazonses.com', ' Bounce+Riikka1@Simulator.AmazonSES.com', 'stranger@example.com'],
        {}
      )

      sentTo(['bounce@simulator.amazonses.com', ' Bounce+Riikka1@Simulator.AmazonSES.com'])
      expect(mockQuery).toHaveBeenCalledTimes(1)
      expect(mockQuery).toHaveBeenCalledWith(expect.objectContaining({ values: { ':email': 'stranger@example.com' } }))
    })

    it('does not take a look-alike of the simulator domain for it', async () => {
      await sendTemplatedMail(
        'registration',
        'fi',
        'sender@example.com',
        [
          'bounce@evilsimulator.amazonses.com',
          'bounce@x.simulator.amazonses.com',
          'bounce@simulator.amazonses.com.evil.fi',
          'simulator.amazonses.com',
          '@simulator.amazonses.com',
          'simulator.amazonses.com@example.com',
        ],
        {}
      )

      expect(mockSend).not.toHaveBeenCalled()
    })
  })

  it('strips a plus tag and normalizes the address', () => {
    expect(withoutPlusTag(' Jukka+kk-7f3a9c@Example.com ')).toBe('jukka@example.com')
    expect(withoutPlusTag('jukka@example.com')).toBe('jukka@example.com')
    expect(withoutPlusTag('jukka+a+b@example.com')).toBe('jukka@example.com')
    expect(withoutPlusTag('jukka+kk')).toBe('jukka+kk')
    expect(withoutPlusTag('jukka@example+x.com')).toBe('jukka@example+x.com')
  })

  // A text of `+` without an `@` used to be scanned again from every `+` (KOE-1474)
  it('strips a plus tag in linear time', () => {
    const long = '+'.repeat(200_000)
    const started = performance.now()

    expect(withoutPlusTag(long)).toBe(long)
    expect(performance.now() - started).toBeLessThan(1000)
  })

  it('tags registration mail with the sending stack (KOE-1468)', () => {
    const [registration] = jsonRegistrationsToEventWithParticipantsInvited

    expect(registrationEmailTags(registration, 'invitation')).toEqual([
      { Name: 'eventId', Value: registration.eventId },
      { Name: 'registrationId', Value: registration.id },
      { Name: 'stack', Value: 'local' },
      { Name: 'template', Value: 'invitation' },
    ])
  })

  describe('emailTo', () => {
    const [registration] = jsonRegistrationsToEventWithParticipantsInvited
    const withPayer = {
      ...registration,
      handler: { ...registration.handler, email: 'handler@example.com', membership: false, name: 'Handler' },
      owner: { ...registration.owner, email: 'owner@example.com', membership: false, name: 'Owner' },
      owners: undefined,
      payer: { email: 'payer@example.com', name: 'Payer' },
    }

    it('goes to the handler and the owner', () => {
      expect(emailTo(withPayer)).toEqual(['handler@example.com', 'owner@example.com'])
      expect(emailTo(withPayer, 'message')).toEqual(['handler@example.com', 'owner@example.com'])
    })

    it('adds the payer to a payment request, once (KOE-722)', () => {
      expect(emailTo(withPayer, 'payment-request')).toEqual([
        'handler@example.com',
        'owner@example.com',
        'payer@example.com',
      ])
      expect(
        emailTo({ ...withPayer, payer: { email: 'owner@example.com', name: 'Owner' } }, 'payment-request')
      ).toEqual(['handler@example.com', 'owner@example.com'])
    })
  })
})
