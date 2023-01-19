import { AtomEffect } from 'recoil'

export const logEffect: AtomEffect<any> = ({node, onSet}) => {
  onSet(newValue => {
    if (typeof jest === 'undefined') { // No logs during tests
      console.debug('recoil', node.key, newValue)
    }
  })
}
