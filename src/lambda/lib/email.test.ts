import { vi } from 'vitest'

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
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await sendTemplatedMail('registration', 'fi', 'sender@example.com', ['first@example.com', 'second@example.com'], {})

    expect(logSpy).toHaveBeenCalledWith('Sending email', {
      recipientCount: 2,
      template: 'registration',
    })
    expect(mockSend).toHaveBeenCalledTimes(1)
  })
})
