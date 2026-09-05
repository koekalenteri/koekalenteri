import { vi } from 'vitest'
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

const { sendTemplatedMail } = await import('./email')

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
})
