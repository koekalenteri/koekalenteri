import { AtomEffect } from 'recoil'

export const logEffect: AtomEffect<any> = ({ node, onSet }) => {
  onSet((newValue, oldValue, reset) => {
    if (typeof jest === 'undefined' && process.env.NODE_ENV === 'development') {
      // No logs during tests
      console.debug('recoil', node.key, { newValue, oldValue, reset })
    }
  })
}
