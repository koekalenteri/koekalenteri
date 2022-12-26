import { AtomEffect } from "recoil"

export const logEffect: AtomEffect<any> = ({node, onSet}) => {
  onSet(newValue => console.debug('recoil', node.key, newValue))
}
