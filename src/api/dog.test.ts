import i18n from 'i18next'
import fetchMock from 'jest-fetch-mock'
import { enqueueSnackbar } from 'notistack'
import { API_BASE_URL } from '../routeConfig'
import { getDog } from './dog'

fetchMock.enableMocks()

jest.mock('notistack', () => ({
  enqueueSnackbar: jest.fn(),
}))

beforeEach(() => fetchMock.resetMocks())

describe('getDog', () => {
  beforeAll(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterAll(() => {
    jest.restoreAllMocks()
  })
  it('should fetch dog without refresh', async () => {
    fetchMock.mockResponse(JSON.stringify({ regNo: 'testReg' }))
    const dog = await getDog('testReg')
    expect(dog.regNo).toEqual('testReg')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/dog/testReg`, expect.any(Object))
  })

  it('should fetch dog with refresh', async () => {
    fetchMock.mockResponse(JSON.stringify({ regNo: 'testReg' }))
    const dog = await getDog('testReg2', true)
    expect(dog.regNo).toEqual('testReg')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/dog/testReg2?refresh`, expect.any(Object))
  })

  it('should encode regNo', async () => {
    fetchMock.mockResponse(JSON.stringify({ regNo: 'testReg' }))
    await getDog('test/Reg')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/dog/test~Reg`, expect.any(Object))
  })

  it('should encode regNo with multiple slashes', async () => {
    fetchMock.mockResponse(JSON.stringify({ regNo: 'testReg' }))
    await getDog('test/Reg/2')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE_URL}/dog/test~Reg~2`, expect.any(Object))
  })

  it('should pass signal to fetch', async () => {
    let fetchSignal: AbortSignal | null | undefined
    fetchMock.mockImplementationOnce((_url, init) => {
      fetchSignal = init?.signal
      return Promise.resolve(new Response(JSON.stringify({ regNo: 'testReg' })))
    })
    const controller = new AbortController()
    await getDog('testReg', false, controller.signal)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE_URL}/dog/testReg`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
    expect(fetchSignal).toBeDefined()
    expect(fetchSignal?.aborted).toBe(false)
    controller.abort()
    expect(fetchSignal?.aborted).toBe(true)
  })

  it('should show a connection recovery message and throw when fetch fails', async () => {
    const error = new Error('Failed to fetch')
    fetchMock.mockReject(error)
    await expect(getDog('testReg')).rejects.toThrow(error)
    expect(enqueueSnackbar).toHaveBeenCalledWith(i18n.t('error.connectionInterrupted'), {
      persist: true,
      variant: 'error',
    })
  })
})
