import type { AtomEffect } from 'recoil'

import { isDevEnv } from '../../../lib/env'

export const logEffect: AtomEffect<any> = ({ node, onSet }) => {
  onSet((newValue, oldValue, reset) => {
    if (typeof jest === 'undefined' && isDevEnv()) {
      // No logs during tests
      console.debug('recoil', node.key, { newValue, oldValue, reset })
    }
  })
}
