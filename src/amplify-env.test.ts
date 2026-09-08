import { shouldIgnoreRumError } from './amplify-env'

describe('RUM_CONFIG', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it.each([
    ['dev', 1],
    ['test', 1],
    ['prod', 0.25],
  ])('samples every session on %s stage or a quarter on prod', async (stage, rate) => {
    vi.stubEnv('REACT_APP_API_BASE_URL', `https://api.example.com/${stage}`)
    vi.resetModules()

    const { RUM_CONFIG } = await import('./amplify-env')

    expect(RUM_CONFIG.sessionSampleRate).toBe(rate)
  })
})

describe('shouldIgnoreRumError', () => {
  it('ignores Safari masked overlay observer errors', () => {
    const error = new Error("Can't find variable: observer")
    error.stack = [
      'observeDOMChanges@webkit-masked-url://hidden/:138:17',
      'showFloatingViewBasedOnOverlaySettings@webkit-masked-url://hidden/:117:26',
      '@webkit-masked-url://hidden/:52:47',
    ].join('\n')

    expect(
      shouldIgnoreRumError(
        new ErrorEvent('error', {
          error,
          filename: 'webkit-masked-url://hidden/',
          message: "Can't find variable: observer",
        })
      )
    ).toBe(true)
  })

  it('reports normal application errors', () => {
    const error = new Error("Can't find variable: observer")
    error.stack = 'observeDOMChanges@https://example.com/static/app.js:138:17'

    expect(
      shouldIgnoreRumError(
        new ErrorEvent('error', {
          error,
          filename: 'https://example.com/static/app.js',
          message: "Can't find variable: observer",
        })
      )
    ).toBe(false)
  })

  it('ignores token expired API errors', () => {
    expect(shouldIgnoreRumError(new Error('401 The incoming token has expired'))).toBe(true)
  })

  it('ignores token expired API error events', () => {
    expect(
      shouldIgnoreRumError(
        new ErrorEvent('error', {
          error: new Error('401 The incoming token has expired'),
          filename: 'https://koekalenteri.snj.fi/static/js/792.7bf8c955.js',
          message: 'Uncaught Error: 401 The incoming token has expired',
        })
      )
    ).toBe(true)
  })

  it('ignores external object bridge errors', () => {
    expect(shouldIgnoreRumError(new Error('Object Not Found Matching Id:2, MethodName:update, ParamCount:4'))).toBe(
      true
    )
  })

  it('ignores external object bridge error events', () => {
    expect(
      shouldIgnoreRumError(
        new ErrorEvent('error', {
          error: new Error('Object Not Found Matching Id:2, MethodName:update, ParamCount:4'),
          filename: 'https://koekalenteri.snj.fi/static/js/792.7bf8c955.js',
          message: 'Object Not Found Matching Id:2, MethodName:update, ParamCount:4',
        })
      )
    ).toBe(true)
  })

  it('reports other object not found errors', () => {
    expect(shouldIgnoreRumError(new Error('Object Not Found Matching Id:9, MethodName:update, ParamCount:4'))).toBe(
      false
    )
  })

  it('reports promise rejections', () => {
    expect(shouldIgnoreRumError({ reason: new Error('test') } as PromiseRejectionEvent)).toBe(false)
  })
})
