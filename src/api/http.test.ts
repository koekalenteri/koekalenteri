import * as awsAuth from 'aws-amplify/auth'
import fetchMock from 'jest-fetch-mock'
import { enqueueSnackbar } from 'notistack'
import { API_BASE_URL } from '../routeConfig'
import http from './http'

fetchMock.enableMocks()
jest.mock('notistack', () => ({
  enqueueSnackbar: jest.fn(),
}))

const mockConsoleError = jest.spyOn(console, 'error').mockImplementation()
const mock5SecondFetch = () => new Promise<string>((resolve) => setTimeout(resolve, 5_000))
const mock20SecondFetch = () => new Promise<string>((resolve) => setTimeout(resolve, 20_000))

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
      expect(fetchMock.mock.calls.length).toEqual(1)
      expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/test/`)
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

      expect(promise).rejects.toEqual(expect.objectContaining({ name: 'AbortError' }))
    })

    it('should abort on post-aborted signal', async () => {
      fetchMock.mockResponseOnce(mock5SecondFetch)

      const controller = new AbortController()

      const promise = http.get('/somewhere', { signal: controller.signal })
      controller.abort('because')

      expect(promise).rejects.toEqual(expect.objectContaining({ name: 'AbortError' }))
    })

    it.each([401, 404])('should not show a snackbar with status %p', async (status) => {
      fetchMock.mockResponse('fail', { status, statusText: 'status text' })

      const promise = http.get('/somewhere')

      expect(promise).rejects.toEqual(expect.objectContaining({ status, statusText: 'status text' }))
      expect(enqueueSnackbar).not.toHaveBeenCalled()
    })

    it('should timeout', async () => {
      jest.useFakeTimers()

      fetchMock.mockResponseOnce(mock20SecondFetch)

      const promise = http.get('/test/')

      jest.advanceTimersByTime(10_000)

      await Promise.resolve()
      expect(promise).rejects.toEqual(
        expect.objectContaining({ status: 408, statusText: `timeout loading ${API_BASE_URL}/test/` })
      )

      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })

    it('should refresh token with 401 / The incoming token has expired', async () => {
      fetchMock.mockResponseOnce('The incoming token has expired', {
        status: 401,
        statusText: 'access denied',
      })

      fetchMock.mockResponseOnce(JSON.stringify('success!'), {
        status: 200,
        statusText: 'ok',
      })

      jest
        .spyOn(awsAuth, 'fetchAuthSession')
        .mockResolvedValueOnce({ tokens: { idToken: { toString: () => 'fresh token' } } } as any)

      const response = await http.get('/secure', { headers: { Authorization: 'asdf' } })

      expect(response).toEqual('success!')
    })

    it('should throw if refreshing tokens throws', async () => {
      fetchMock.mockResponseOnce('The incoming token has expired', {
        status: 401,
        statusText: 'access denied',
      })

      const err = new Error('auth err')
      jest.spyOn(awsAuth, 'fetchAuthSession').mockRejectedValueOnce(err)

      const response = http.get('/secure', { headers: { Authorization: 'asdf' } })

      expect(response).rejects.toEqual(err)
    })

    it('should throw if refreshing tokens fail', async () => {
      fetchMock.mockResponseOnce('The incoming token has expired', {
        status: 401,
        statusText: 'access denied',
      })

      jest.spyOn(awsAuth, 'fetchAuthSession').mockResolvedValueOnce({})

      const response = http.get('/secure', { headers: { Authorization: 'asdf' } })

      expect(response).rejects.toEqual(expect.objectContaining({ status: 401, statusText: 'access denied' }))
    })
  })

  describe('post', () => {
    it('should specify "POST" as method', async () => {
      fetchMock.mockResponse((req) =>
        req.method === 'POST'
          ? Promise.resolve(JSON.stringify('ok'))
          : Promise.reject(new Error(`${req.method} !== 'POST'`))
      )

      const json = await http.post('/test/', {})

      expect(json).toEqual('ok')
      expect(fetchMock.mock.calls.length).toEqual(1)
      expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/test/`)
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
      expect(fetchMock.mock.calls.length).toEqual(1)
      expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/test/`)
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
      expect(fetchMock.mock.calls.length).toEqual(1)
      expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/test/`)
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

  describe('delete', () => {
    it('should specify "DELETE" as method', async () => {
      fetchMock.mockResponse((req) =>
        req.method === 'DELETE'
          ? Promise.resolve(JSON.stringify('ok'))
          : Promise.reject(new Error(`${req.method} !== 'DELETE'`))
      )

      const json = await http.delete('/test/', {})

      expect(json).toEqual('ok')
      expect(fetchMock.mock.calls.length).toEqual(1)
      expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/test/`)
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
})
