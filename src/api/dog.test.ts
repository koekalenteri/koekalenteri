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
    expect(fetchMock.mock.calls.length).toEqual(1)
    expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/dog/testReg`)
  })

  it('should fetch dog with refresh', async () => {
    fetchMock.mockResponse(JSON.stringify({ regNo: 'testReg' }))
    const dog = await getDog('testReg2', true)
    expect(dog.regNo).toEqual('testReg')
    expect(fetchMock.mock.calls.length).toEqual(1)
    expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/dog/testReg2?refresh`)
  })

  it('should encode regNo', async () => {
    fetchMock.mockResponse(JSON.stringify({ regNo: 'testReg' }))
    await getDog('test/Reg')
    expect(fetchMock.mock.calls.length).toEqual(1)
    expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/dog/test~Reg`)
  })

  it('should encode regNo with multiple slashes', async () => {
    fetchMock.mockResponse(JSON.stringify({ regNo: 'testReg' }))
    await getDog('test/Reg/2')
    expect(fetchMock.mock.calls.length).toEqual(1)
    expect(fetchMock.mock.calls[0][0]).toEqual(`${API_BASE_URL}/dog/test~Reg~2`)
  })

  it('should pass signal to fetch', async () => {
    fetchMock.mockResponse(JSON.stringify({ regNo: 'testReg' }))
    const controller = new AbortController()
    await getDog('testReg', false, controller.signal)
    expect(fetchMock.mock.calls.length).toEqual(1)
    const fetchOptions = fetchMock.mock.calls[0][1]
    expect(fetchOptions?.signal).toBeDefined()
    expect(fetchOptions?.signal?.aborted).toBe(false)
    controller.abort()
    expect(fetchOptions?.signal?.aborted).toBe(true)
  })

  it('should show snackbar and throw when fetch fails', async () => {
    const error = new Error('Failed to fetch')
    fetchMock.mockReject(error)
    await expect(getDog('testReg')).rejects.toThrow(error)
    expect(enqueueSnackbar).toHaveBeenCalledWith('Error: Failed to fetch', { variant: 'error' })
  })
})
