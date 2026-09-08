import { vi } from 'vitest'
import { jsonRegistrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import { loggedLines } from '../test-utils/logs'

const mockSend = vi.fn<() => Promise<void>>()

vi.doMock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn(function MockSESClient() {
    return { send: mockSend }
  }),
  SendTemplatedEmailCommand: vi.fn(function MockSendTemplatedEmailCommand(input) {
    return { input }
  }),
}))

const { emailTo, sendTemplatedMail } = await import('./email')

describe('email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSend.mockResolvedValue(undefined)
  })

  it('logs delivery metadata without sender or recipient addresses', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

    await sendTemplatedMail('registration', 'fi', 'sender@example.com', ['first@example.com', 'second@example.com'], {})

    expect(loggedLines(infoSpy)).toContainEqual(
      expect.objectContaining({ message: 'sending email', recipientCount: 2, template: 'registration' })
    )
    expect(mockSend).toHaveBeenCalledTimes(1)
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
