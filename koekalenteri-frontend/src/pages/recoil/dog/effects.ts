import { Dog } from "koekalenteri-shared/model"
import { AtomEffect } from "recoil"

import { getDog } from "../../../api/dog"


export const remoteDogEffect: AtomEffect<Dog|undefined> = ({ node, setSelf, trigger }) => {
  if (trigger === 'get') {
    const regNo = node.key.split('__')[1]?.slice(1, -1)
    if (regNo) {
      getDog(regNo).then(setSelf)
    }
  }
}
