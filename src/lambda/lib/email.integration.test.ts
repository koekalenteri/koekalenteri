import type { JsonUser } from '../../types'
import { vi } from 'vitest'
import { uniqueId } from '../test-utils/integration'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const mockSend = vi.fn<() => Promise<void>>()

// SES is the boundary: the recipients it is handed are the assertion.
vi.doMock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn(function MockSESClient() {
    return { send: mockSend }
  }),
  SendTemplatedEmailCommand: vi.fn(function MockSendTemplatedEmailCommand(input) {
    return { input }
  }),
}))

const { CONFIG } = await import('../config')
const { __resetStaffAddressCache, sendTemplatedMail } = await import('./email')

/**
 * Outside prod a message is delivered only to staff (KOE-1469), which `isStaffAddress` decides by
 * reading the user table through gsiEmail.
 */
describe('sendTemplatedMail outside prod against DynamoDB-local', () => {
  const client = new CustomDynamoClient('UserTable')
  const { stageName } = CONFIG

  const user = (overrides: Partial<JsonUser> = {}): JsonUser => {
    const id = uniqueId('user')
    return {
      createdAt: '2026-01-01T00:00:00.000Z',
      createdBy: 'test',
      email: `${id}@example.com`,
      id,
      modifiedAt: '2026-01-01T00:00:00.000Z',
      modifiedBy: 'test',
      name: `User ${id}`,
      ...overrides,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    __resetStaffAddressCache()
    CONFIG.stageName = 'test'
    mockSend.mockResolvedValue(undefined)
  })

  afterAll(() => {
    CONFIG.stageName = stageName
  })

  it('delivers to an admin and a role holder, also at a plus-address, and not to the others', async () => {
    const admin = user({ admin: true })
    const secretary = user({ roles: { [uniqueId('org')]: 'secretary' } })
    const participant = user()
    const deletedAdmin = user({ admin: true, deletedAt: '2026-02-01T00:00:00.000Z' })
    await client.batchWrite([admin, secretary, participant, deletedAdmin])
    const [adminLocal, adminDomain] = admin.email.split('@')

    await sendTemplatedMail(
      'registration',
      'fi',
      'sender@example.com',
      [
        admin.email,
        `${adminLocal}+tag@${adminDomain}`,
        secretary.email,
        participant.email,
        deletedAdmin.email,
        `${uniqueId('nobody')}@example.com`,
      ],
      {}
    )

    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Destination: { ToAddresses: [admin.email, `${adminLocal}+tag@${adminDomain}`, secretary.email] },
        }),
      })
    )
  })

  it('sends nothing when no recipient is staff', async () => {
    const participant = user()
    await client.write(participant)

    await sendTemplatedMail('registration', 'fi', 'sender@example.com', [participant.email], {})

    expect(mockSend).not.toHaveBeenCalled()
  })
})
