import { CONFIG } from '../config'
import { getFrontendOrigin, getOrigin, isAwsServiceError } from './api-gw'

describe('lib/api-gw', () => {
  describe('getOrigin', () => {
    it.each`
      event                | expected
      ${null}              | ${''}
      ${undefined}         | ${''}
      ${{}}                | ${''}
      ${{ headers: null }} | ${''}
    `('when event is $event, it should return "$expected"', ({ event, expected }) => {
      expect(getOrigin(event)).toEqual(expected)
    })

    it.each`
      event                                        | expected
      ${{ headers: null }}                         | ${''}
      ${{ headers: { origin: 'test' } }}           | ${'test'}
      ${{ headers: { Origin: 'test' } }}           | ${'test'}
      ${{ headers: { Origin: 'b', origin: 'a' } }} | ${'a'}
    `('when headers are $event.headers, it should return "$expected"', ({ event, expected }) => {
      expect(getOrigin(event)).toEqual(expected)
    })
  })

  describe('getFrontendOrigin', () => {
    const originalStageName = CONFIG.stageName

    afterEach(() => {
      CONFIG.stageName = originalStageName
    })

    it('accepts the exact local frontend origin in the dev stage', () => {
      CONFIG.stageName = 'dev'

      expect(getFrontendOrigin({ headers: { origin: 'http://localhost:3000' } })).toBe('http://localhost:3000')
    })

    it.each(['http://localhost:3001', 'https://localhost:3000', 'http://localhost:3000.attacker.example'])(
      'rejects the non-allowlisted dev origin %s',
      (origin) => {
        CONFIG.stageName = 'dev'

        expect(getFrontendOrigin({ headers: { origin } })).toBe(CONFIG.frontendURL)
      }
    )

    it('rejects the local frontend origin outside the dev stage', () => {
      CONFIG.stageName = 'prod'

      expect(getFrontendOrigin({ headers: { origin: 'http://localhost:3000' } })).toBe(CONFIG.frontendURL)
    })
  })

  describe('isAwsServiceError', () => {
    it.each`
      error                                                                 | expected
      ${null}                                                               | ${false}
      ${undefined}                                                          | ${false}
      ${'boom'}                                                             | ${false}
      ${123}                                                                | ${false}
      ${{}}                                                                 | ${false}
      ${{ name: 'ServiceException' }}                                       | ${true}
      ${new Error('boom')}                                                  | ${true}
      ${{ $metadata: { httpStatusCode: 404 }, name: 'S3ServiceException' }} | ${true}
    `('returns $expected for $error', ({ error, expected }) => {
      expect(isAwsServiceError(error)).toBe(expected)
    })

    it('narrows unknown to aws service error shape', () => {
      const error: unknown = { $metadata: { httpStatusCode: 403 }, message: 'denied', name: 'SESServiceException' }

      if (isAwsServiceError(error)) {
        const name: string | undefined = error.name
        const message: string | undefined = error.message
        const statusCode: number | undefined = error.$metadata?.httpStatusCode

        expect(name).toBe('SESServiceException')
        expect(message).toBe('denied')
        expect(statusCode).toBe(403)
      } else {
        throw new Error('Type guard should have matched')
      }
    })
  })
})
