import type { AwsRum } from 'aws-rum-web'

import { reportError } from './error'
import * as rum from './rum'

describe('error', () => {
  describe('reportError', () => {
    it('should call reportError on rum', () => {
      const recordError = jest.fn()
      jest.spyOn(rum, 'rum').mockImplementationOnce(() => ({ recordError }) as unknown as AwsRum)

      reportError('test')

      expect(recordError).toHaveBeenCalledTimes(1)
      expect(recordError).toHaveBeenCalledWith('test')
    })

    it('should log to console, when rum is not available', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementationOnce(jest.fn())
      jest.spyOn(rum, 'rum').mockImplementationOnce(() => undefined)

      reportError('test')

      expect(consoleError).toHaveBeenCalledTimes(1)
      expect(consoleError).toHaveBeenCalledWith('reportError', 'test')
    })
  })
})
