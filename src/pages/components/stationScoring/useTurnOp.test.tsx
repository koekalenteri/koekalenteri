import { act, renderHook } from '@testing-library/react'
import { enqueueSnackbar } from 'notistack'
import { errorSnackbarOptions } from '@/lib/client/snackbar'
import { useTurnOp } from './useTurnOp'

vi.mock('notistack', async (importOriginal) => ({
  ...(await importOriginal<typeof import('notistack')>()),
  enqueueSnackbar: vi.fn(),
}))

describe('useTurnOp', () => {
  beforeEach(() => {
    vi.mocked(enqueueSnackbar).mockClear()
  })

  it('drops a second tap made while the first is on its way', async () => {
    let settle: (value?: unknown) => void = () => undefined
    const pending = new Promise((resolve) => {
      settle = resolve
    })
    // The first send waits until the test lets it through; any later one goes through at once.
    const onTurn = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(undefined)
    const { result } = renderHook(() => useTurnOp(onTurn))

    let first: Promise<void> = Promise.resolve()
    await act(async () => {
      first = result.current({ type: 'end' })
      await result.current({ type: 'next' })
    })
    expect(onTurn).toHaveBeenCalledTimes(1)
    expect(onTurn).toHaveBeenCalledWith({ type: 'end' })

    await act(async () => {
      settle()
      await first
    })
    await act(async () => {
      await result.current({ type: 'next' })
    })
    expect(onTurn).toHaveBeenCalledTimes(2)
    expect(onTurn).toHaveBeenLastCalledWith({ type: 'next' })
  })

  it('says a failed send failed, and takes the next tap after it', async () => {
    const onTurn = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useTurnOp(onTurn))

    await act(async () => {
      await result.current({ type: 'end' })
    })
    expect(enqueueSnackbar).toHaveBeenCalledWith('liveStatus.turnSaveFailed', errorSnackbarOptions)

    await act(async () => {
      await result.current({ type: 'end' })
    })
    expect(onTurn).toHaveBeenCalledTimes(2)
    expect(enqueueSnackbar).toHaveBeenCalledTimes(1)
  })
})
