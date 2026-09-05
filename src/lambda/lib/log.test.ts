import { vi } from 'vitest'
import { constructAPIGwEvent } from '../test-utils/helpers'
import { debugProxyEvent, hashIdentity, logger, withLogContext } from './log'

/** Every line the logger wrote during a test, parsed back from the JSON it handed to console. */
let lines: Record<string, unknown>[] = []
const capture = (line: string) => {
  lines.push(JSON.parse(line))
}

const debugSpy = vi.spyOn(console, 'debug').mockImplementation(capture)
const errorSpy = vi.spyOn(console, 'error').mockImplementation(capture)
const infoSpy = vi.spyOn(console, 'info').mockImplementation(capture)
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(capture)

describe('log', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    lines = []
    debugSpy.mockImplementation(capture)
    errorSpy.mockImplementation(capture)
    infoSpy.mockImplementation(capture)
    warnSpy.mockImplementation(capture)
  })

  describe('logger', () => {
    it.each([
      ['debug', () => debugSpy],
      ['error', () => errorSpy],
      ['info', () => infoSpy],
      ['warn', () => warnSpy],
    ] as const)('should write %s as one json line through the matching console method', (level, spy) => {
      logger[level]('something happened')

      expect(spy()).toHaveBeenCalledTimes(1)
      expect(lines).toEqual([{ level, message: 'something happened' }])
    })

    it('should include the given fields', () => {
      logger.info('locations written', { count: 12, previously: 10 })

      expect(lines).toEqual([{ count: 12, level: 'info', message: 'locations written', previously: 10 }])
    })

    it('should unpack an Error, which json would otherwise drop', () => {
      const error = new Error('boom')

      logger.error('failed', { error })

      expect(lines).toEqual([
        {
          error: { message: 'boom', name: 'Error', stack: error.stack },
          level: 'error',
          message: 'failed',
        },
      ])
    })

    it('should unpack an Error nested in a field', () => {
      logger.error('failed', { results: [{ error: new TypeError('nope') }] })

      expect(lines).toEqual([
        {
          level: 'error',
          message: 'failed',
          results: [{ error: expect.objectContaining({ message: 'nope', name: 'TypeError' }) }],
        },
      ])
    })

    it('should keep the message when a field cannot be serialized', () => {
      const circular: Record<string, unknown> = {}
      circular.self = circular

      logger.warn('odd payload', { circular })

      expect(lines).toEqual([{ fieldsError: expect.any(String), level: 'warn', message: 'odd payload' }])
    })

    it('should not throw when a field cannot be serialized', () => {
      expect(() => logger.info('bigint', { size: 1n })).not.toThrow()
    })
  })

  describe('withLogContext', () => {
    it('should add the context to every line written inside it', () => {
      withLogContext({ requestId: 'request-id', service: 'getEvents' }, () => {
        logger.info('first')
        logger.warn('second')
      })

      expect(lines).toEqual([
        { level: 'info', message: 'first', requestId: 'request-id', service: 'getEvents' },
        { level: 'warn', message: 'second', requestId: 'request-id', service: 'getEvents' },
      ])
    })

    it('should keep the context across awaits', async () => {
      await withLogContext({ requestId: 'request-id' }, async () => {
        await Promise.resolve()
        logger.info('after await')
      })

      expect(lines).toEqual([{ level: 'info', message: 'after await', requestId: 'request-id' }])
    })

    it('should omit context fields that are not set', () => {
      withLogContext({ service: 'getEvents' }, () => logger.info('no request id'))

      expect(lines).toEqual([{ level: 'info', message: 'no request id', service: 'getEvents' }])
    })

    it('should not leak the context to lines written after it', () => {
      withLogContext({ requestId: 'request-id' }, () => logger.info('inside'))
      logger.info('outside')

      expect(lines).toEqual([
        { level: 'info', message: 'inside', requestId: 'request-id' },
        { level: 'info', message: 'outside' },
      ])
    })

    it('should return the value of the wrapped function', () => {
      expect(withLogContext({ requestId: 'request-id' }, () => 'result')).toEqual('result')
    })
  })

  describe('hashIdentity', () => {
    it('should not reveal the identity it was given', () => {
      expect(hashIdentity('participant@example.com')).not.toContain('participant')
    })

    it('should give the same handle for the same identity', () => {
      expect(hashIdentity('participant@example.com')).toEqual(hashIdentity('participant@example.com'))
    })

    it('should ignore case and surrounding space, as the emails do', () => {
      expect(hashIdentity(' Participant@Example.com ')).toEqual(hashIdentity('participant@example.com'))
    })

    it('should give different handles for different identities', () => {
      expect(hashIdentity('a@example.com')).not.toEqual(hashIdentity('b@example.com'))
    })
  })

  describe('debugProxyEvent', () => {
    it('should log only explicitly allowed request metadata', () => {
      const evt = constructAPIGwEvent(
        { email: 'participant@example.com' },
        {
          headers: { Authorization: 'Bearer secret', Cookie: 'session=secret', signature: 'secret-signature' },
          method: 'POST',
          path: '/registrations',
          query: { token: 'edit-secret' },
        }
      )
      evt.resource = '/registrations'

      withLogContext({ requestId: 'request-id' }, () => debugProxyEvent(evt))

      expect(debugSpy).toHaveBeenCalledTimes(1)
      expect(lines).toEqual([
        {
          httpMethod: 'POST',
          level: 'debug',
          message: 'request',
          requestId: 'request-id',
          resource: '/registrations',
        },
      ])
      expect(errorSpy).not.toHaveBeenCalled()
    })
  })
})
