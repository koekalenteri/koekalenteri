import type { RecoilState } from 'recoil'

import * as envLib from '../../../lib/env'

import { logEffect } from './log'

describe('log', () => {
  const logSpy = jest.spyOn(console, 'debug')
  const node: RecoilState<any> = {
    __tag: ['test'],
    __cTag: function (t: any): void {
      throw new Error('Function not implemented.')
    },
    key: 'test-key',
    toJSON: function (): { key: string } {
      throw new Error('Function not implemented.')
    },
  }
  let onSetCallback: ((newValue: any, oldValue: any, reset: boolean) => void) | undefined

  const onSet = (param: (newValue: any, oldValue: any, reset: boolean) => void) => {
    onSetCallback = param
  }

  // @ts-expect-error providing only used arguments
  logEffect({ node, onSet })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should log to the console in development environment', () => {
    jest.spyOn(envLib, 'isDevEnv').mockReturnValueOnce(true)

    onSetCallback?.('new', 'old', false)
    expect(logSpy).toHaveBeenCalledWith('recoil', 'test-key', { newValue: 'new', oldValue: 'old', reset: false })
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it('should not log to the console in other environments', () => {
    jest.spyOn(envLib, 'isDevEnv').mockReturnValueOnce(false)

    onSetCallback?.('new', 'old', false)
    expect(logSpy).not.toHaveBeenCalled()
  })
})
