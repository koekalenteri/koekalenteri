import { jest } from '@jest/globals'

const mockHandle = jest.fn<any>()

jest.unstable_mockModule('./handler', async () => {
  const actual = await jest.requireActual<typeof import('./handler')>('./handler')
  return {
    ...actual,
    __esModule: true,
    default: mockHandle,
  }
})

const { default: sendMessagesLambda } = await import('./handler')

describe('sendMessagesLambda transport boundary', () => {
  it('is wired as a lambda entrypoint function', () => {
    expect(typeof sendMessagesLambda).toBe('function')
  })

  it('invokes the handler boundary with API Gateway event payload', async () => {
    const event = {
      body: JSON.stringify({ eventId: 'event-1', registrationIds: ['r1'], template: 'invitation', text: 'hello' }),
      headers: {},
    }

    await sendMessagesLambda(event as any)

    expect(mockHandle).toHaveBeenCalledWith(event)
  })
})
