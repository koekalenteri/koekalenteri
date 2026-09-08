import { reportError } from './error'
import * as rum from './rum'

describe('error', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('reportError', () => {
    it('should call reportError on rum', () => {
      const recordError = vi.spyOn(rum, 'recordError').mockImplementation(() => {})

      reportError('test')

      expect(recordError).toHaveBeenCalledTimes(1)
      expect(recordError).toHaveBeenCalledWith('test', expect.any(Function))
    })

    it('should ignore token expired errors', () => {
      const recordError = vi.spyOn(rum, 'recordError').mockImplementation(() => {})

      reportError(new Error('401 The incoming token has expired'))

      expect(recordError).not.toHaveBeenCalled()
    })

    it('should log to console, when rum is not available', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementationOnce(vi.fn())
      vi.spyOn(rum, 'recordError').mockImplementation((_error, whenUnavailable) => whenUnavailable?.())

      reportError('test')

      expect(consoleError).toHaveBeenCalledTimes(1)
      expect(consoleError).toHaveBeenCalledWith('reportError', 'test')
    })
  })
})
