import { jest } from '@jest/globals'

const mockSend = jest.fn<() => Promise<void>>()

jest.unstable_mockModule('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: mockSend })),
  SendTemplatedEmailCommand: jest.fn((input) => ({ input })),
}))

const { sendTemplatedMail } = await import('./email')

describe('email', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSend.mockResolvedValue(undefined)
  })

  it('logs delivery metadata without sender or recipient addresses', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined)

    await sendTemplatedMail('registration', 'fi', 'sender@example.com', ['first@example.com', 'second@example.com'], {})

    expect(logSpy).toHaveBeenCalledWith('Sending email', {
      recipientCount: 2,
      template: 'registration',
    })
    expect(mockSend).toHaveBeenCalledTimes(1)
  })
})
