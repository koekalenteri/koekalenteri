import fetchMock from 'jest-fetch-mock'
import { enqueueSnackbar } from 'notistack'
import { API_BASE_URL } from '../routeConfig'
import http, { APIError, withToken } from './http'

fetchMock.enableMocks()
jest.mock('notistack', () => ({
  enqueueSnackbar: jest.fn(),
}))

const mockConsoleError = jest.spyOn(console, 'error').mockImplementation()
const mock5SecondFetch = () => new Promise<string>((resolve) => setTimeout(resolve, 5_000))

describe('http', () => {
  beforeEach(() => {
    fetchMock.resetMocks()
    mockConsoleError.mockClear()
  })

  describe('get', () => {
    it('should specify "GET" as method', async () => {
      fetchMock.mockResponse((req) =>
        req.method === 'GET'
          ? Promise.resolve(JSON.stringify('ok'))
          : Promise.reject(new Error(`${req.method} !== 'GET'`))
      )

      const json = await http.get('/test/')

      expect(json).toEqual('ok')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test/`, expect.any(Object))
    })

    it('retries a failed network request once', async () => {
      jest.useFakeTimers()
      fetchMock.mockRejectOnce(new TypeError('Failed to fetch'))
      fetchMock.mockResponseOnce(JSON.stringify('ok'))

      const request = http.get('/retry')

      await Promise.resolve()
      expect(fetchMock).toHaveBeenCalledTimes(1)

      await jest.advanceTimersByTimeAsync(399)
      expect(fetchMock).toHaveBeenCalledTimes(1)

      await jest.advanceTimersByTimeAsync(1)
      await expect(request).resolves.toEqual('ok')

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(enqueueSnackbar).not.toHaveBeenCalled()

      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })

    it('retries a failed network request with a non-aborted signal', async () => {
      fetchMock.mockRejectOnce(new TypeError('Failed to fetch'))
      fetchMock.mockResponseOnce(JSON.stringify('ok'))

      const controller = new AbortController()
      await expect(http.get('/retry', { signal: controller.signal })).resolves.toEqual('ok')

      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(enqueueSnackbar).not.toHaveBeenCalled()
    })

    it('does not retry API errors whose message looks like a network error', async () => {
      fetchMock.mockResponseOnce('network connection unavailable', {
        status: 503,
        statusText: 'Network connection unavailable',
      })

      await expect(http.get('/api-error')).rejects.toEqual(
        expect.objectContaining({ status: 503, statusText: 'Network connection unavailable' })
      )

      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('coalesces matching requests only while they are pending', async () => {
      let resolveFetch: (response: Response) => void = () => undefined
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve
          })
      )

      const first = http.get('/coalesced', { headers: { Authorization: 'Bearer token' } })
      const concurrent = http.get('/coalesced', { headers: { Authorization: 'Bearer token' } })

      await Promise.resolve()
      expect(fetchMock).toHaveBeenCalledTimes(1)

      resolveFetch(new Response(JSON.stringify('first response')))
      await expect(Promise.all([first, concurrent])).resolves.toEqual(['first response', 'first response'])

      fetchMock.mockResponseOnce(JSON.stringify('second response'))
      await expect(http.get('/coalesced', { headers: { Authorization: 'Bearer token' } })).resolves.toBe(
        'second response'
      )
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('does not coalesce requests across explicit refresh boundaries', async () => {
      fetchMock.mockResponse(JSON.stringify('ok'))

      await Promise.all([
        http.get('/refreshable', { coalesceRevision: 1 }),
        http.get('/refreshable', { coalesceRevision: 2 }),
      ])

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('returns a rejected promise when request initialization fails', async () => {
      let request: Promise<unknown> | undefined

      expect(() => {
        request = http.get('/invalid-headers', { headers: { 'invalid header': 'value' } })
      }).not.toThrow()

      await expect(request).rejects.toThrow()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('keeps authentication contexts and AbortSignals independent', async () => {
      fetchMock.mockResponse(JSON.stringify('ok'))
      const firstController = new AbortController()
      const secondController = new AbortController()

      await Promise.all([
        http.get('/secure', { headers: { Authorization: 'Bearer first' } }),
        http.get('/secure', { headers: { Authorization: 'Bearer second' } }),
        http.get('/abortable', { signal: firstController.signal }),
        http.get('/abortable', { signal: secondController.signal }),
      ])

      expect(fetchMock).toHaveBeenCalledTimes(4)
    })

    it('should throw status + statusText', async () => {
      fetchMock.mockResponse('fail', {
        status: 500,
        statusText: 'Shit hit the fan!',
      })

      await expect(http.get('/test/')).rejects.toThrow('500 Shit hit the fan!')
      expect(mockConsoleError).toHaveBeenCalled()
    })

    it('should abort on pre-aborted signal', async () => {
      fetchMock.mockResponseOnce(mock5SecondFetch)

      const controller = new AbortController()
      controller.abort('because')

      const promise = http.get('/somewhere', { signal: controller.signal })

      await expect(promise).rejects.toEqual(expect.objectContaining({ name: 'AbortError' }))
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('should abort on post-aborted signal', async () => {
      fetchMock.mockResponseOnce(mock5SecondFetch)

      const controller = new AbortController()

      const promise = http.get('/somewhere', { signal: controller.signal })
      controller.abort('because')

      await expect(promise).rejects.toEqual(expect.objectContaining({ name: 'AbortError' }))
    })

    it.each([401, 404])('should not show a snackbar with status %p', async (status) => {
      fetchMock.mockResponse('fail', { status, statusText: 'status text' })

      const promise = http.get('/somewhere')

      expect(promise).rejects.toEqual(expect.objectContaining({ status, statusText: 'status text' }))
      expect(enqueueSnackbar).not.toHaveBeenCalled()
    })

    it('uses the configured default timeout', async () => {
      jest.useFakeTimers()
      let fetchSignal: AbortSignal | null | undefined
      const originalTimeout = Object.getOwnPropertyDescriptor(process.env, 'REACT_APP_HTTP_TIMEOUT_MS')
      Object.defineProperty(process.env, 'REACT_APP_HTTP_TIMEOUT_MS', {
        configurable: true,
        enumerable: true,
        value: '60',
        writable: true,
      })

      try {
        fetchMock.mockImplementationOnce(
          (_url, init) =>
            new Promise<Response>((_resolve, reject) => {
              fetchSignal = init?.signal
              init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
            })
        )

        const promise = http.get('/test/')
        await Promise.resolve()
        const expectation = expect(promise).rejects.toEqual(
          expect.objectContaining({ status: 408, statusText: `timeout loading ${API_BASE_URL}/test/` })
        )

        await jest.advanceTimersByTimeAsync(59)
        expect(fetchSignal?.aborted).toBe(false)

        await jest.advanceTimersByTimeAsync(1)
        await expectation
      } finally {
        if (originalTimeout) Object.defineProperty(process.env, 'REACT_APP_HTTP_TIMEOUT_MS', originalTimeout)
        else Reflect.deleteProperty(process.env, 'REACT_APP_HTTP_TIMEOUT_MS')
        jest.runOnlyPendingTimers()
        jest.useRealTimers()
      }
    })

    it('supports a per-request timeout override', async () => {
      jest.useFakeTimers()

      fetchMock.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve(new Response(JSON.stringify('ok'))), 20_000))
      )

      const promise = http.get('/slow', { timeoutMs: 30_000 })

      await jest.advanceTimersByTimeAsync(20_000)
      await expect(promise).resolves.toEqual('ok')

      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })

    it('should throw 401 / The incoming token has expired', async () => {
      fetchMock.mockResponseOnce('The incoming token has expired', {
        status: 401,
        statusText: 'access denied',
      })

      const response = http.get('/secure', { headers: { Authorization: 'asdf' } })

      await expect(response).rejects.toEqual(expect.objectContaining({ status: 401, statusText: 'access denied' }))
    })
  })

  it.each([
    ['POST', () => http.post('/no-retry', {})],
    ['PATCH', () => http.patch('/no-retry', {})],
  ])('does not retry a failed %s request', async (_method, request) => {
    const error = new TypeError('Failed to fetch')
    fetchMock.mockReject(error)

    await expect(request()).rejects.toThrow(error)

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  describe('post', () => {
    it('should specify "POST" as method', async () => {
      fetchMock.mockResponse((req) =>
        req.method === 'POST'
          ? Promise.resolve(JSON.stringify('ok'))
          : Promise.reject(new Error(`${req.method} !== 'POST'`))
      )

      const json = await http.post('/test/', {})

      expect(json).toEqual({ data: 'ok', status: 200 })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test/`, expect.any(Object))
    })

    it('does not coalesce mutations', async () => {
      fetchMock.mockResponse(JSON.stringify('ok'))

      await Promise.all([http.post('/test/', {}), http.post('/test/', {})])

      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('should throw status + statusText', async () => {
      fetchMock.mockResponse('fail', {
        status: 500,
        statusText: 'Shit hit the fan!',
      })

      await expect(http.post('/test/', {})).rejects.toThrow('500 Shit hit the fan!')
      expect(mockConsoleError).toHaveBeenCalled()
    })
  })

  describe('postRaw', () => {
    it('should specify "POST" as method', async () => {
      fetchMock.mockResponse((req) =>
        req.method === 'POST'
          ? Promise.resolve(JSON.stringify('ok'))
          : Promise.reject(new Error(`${req.method} !== 'POST'`))
      )

      const json = await http.postRaw('/test/', 'body')

      expect(json).toEqual('ok')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test/`, expect.any(Object))
    })

    it('should throw status + statusText', async () => {
      fetchMock.mockResponse('fail', {
        status: 500,
        statusText: 'Shit hit the fan!',
      })

      await expect(http.put('/test/', {})).rejects.toThrow('500 Shit hit the fan!')
      expect(mockConsoleError).toHaveBeenCalled()
      // expect(enqueueSnackbar).toHaveBeenCalledWith('500 fail', { variant: 'error' })
    })
  })

  describe('put', () => {
    it('should specify "PUT" as method', async () => {
      fetchMock.mockResponse((req) =>
        req.method === 'PUT'
          ? Promise.resolve(JSON.stringify('ok'))
          : Promise.reject(new Error(`${req.method} !== 'PUT'`))
      )

      const json = await http.put('/test/', {})

      expect(json).toEqual('ok')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test/`, expect.any(Object))
    })

    it('should throw status + statusText', async () => {
      fetchMock.mockResponse('fail', {
        status: 500,
        statusText: 'Shit hit the fan!',
      })

      await expect(http.put('/test/', {})).rejects.toThrow('500 Shit hit the fan!')
      expect(mockConsoleError).toHaveBeenCalled()
    })
  })

  describe('patch', () => {
    it('should specify "PATCH" as method', async () => {
      fetchMock.mockResponse((req) =>
        req.method === 'PATCH'
          ? Promise.resolve(JSON.stringify('ok'))
          : Promise.reject(new Error(`${req.method} !== 'PATCH'`))
      )

      const json = await http.patch('/test/', {})

      expect(json).toEqual({ data: 'ok', status: 200 })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test/`, expect.any(Object))
    })

    it('should throw status + statusText', async () => {
      fetchMock.mockResponse('fail', {
        status: 500,
        statusText: 'Shit hit the fan!',
      })

      await expect(http.patch('/test/', {})).rejects.toThrow('500 Shit hit the fan!')
      expect(mockConsoleError).toHaveBeenCalled()
    })
  })

  describe('delete', () => {
    it('should specify "DELETE" as method', async () => {
      fetchMock.mockResponse((req) =>
        req.method === 'DELETE'
          ? Promise.resolve(JSON.stringify('ok'))
          : Promise.reject(new Error(`${req.method} !== 'DELETE'`))
      )

      const json = await http.delete('/test/', {})

      expect(json).toEqual('ok')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/test/`, expect.any(Object))
    })

    it('should throw status + statusText', async () => {
      fetchMock.mockResponse('fail', {
        status: 500,
        statusText: 'Shit hit the fan!',
      })

      await expect(http.delete('/test/', {})).rejects.toThrow('500 Shit hit the fan!')
      expect(mockConsoleError).toHaveBeenCalled()
    })
  })

  describe('coverage for helpers and edge cases', () => {
    it('should set statusText from response body message when statusText is missing', () => {
      const response = { status: 400, statusText: '' } as Response

      const err = new APIError(response, { message: 'body message' })

      expect(err.statusText).toBe('body message')
      expect(err.message).toBe('400 body message')
    })

    it('should fallback to default status text when body object has no message', () => {
      const response = new Response('bad', { status: 500, statusText: 'fallback status' })

      const err = new APIError(response, { error: 'x' })

      expect(err.statusText).toBe('fallback status')
      expect(err.message).toBe('500 fallback status')
    })

    it('should include authorization header only when token exists', () => {
      const withAuth = withToken({ headers: { 'X-Test': '1' } }, 'token-123')
      const withoutAuth = withToken({ headers: { 'X-Test': '1' } })

      expect(withAuth.headers).toEqual({ Authorization: 'Bearer token-123', 'X-Test': '1' })
      expect(withoutAuth.headers).toEqual({ 'X-Test': '1' })
    })

    it('should keep non-JSON error body on APIError when backend returns plain text', async () => {
      fetchMock.mockResponseOnce('plain text error body', {
        status: 400,
        statusText: '',
      })

      await expect(http.get('/text-error')).rejects.toEqual(
        expect.objectContaining({ body: 'plain text error body', status: 400, statusText: 'Bad Request' })
      )
      expect(mockConsoleError).toHaveBeenCalled()
    })

    it('should build APIError message from string body when statusText is missing', () => {
      const response = { status: 500, statusText: '' } as Response

      const err = new APIError(response, 'raw-body-message')

      expect(err.statusText).toBe('raw-body-message')
      expect(err.message).toBe('500 raw-body-message')
    })
  })
})
