import { Dog } from 'koekalenteri-shared/model'
import { AtomEffect } from 'recoil'

import { getDog } from '../../../api/dog'
import { getParamFromFamilyKey } from '../effects'


export const remoteDogEffect: AtomEffect<Dog|undefined> = ({ node, setSelf, trigger }) => {
  if (trigger === 'get') {
    const regNo = getParamFromFamilyKey(node.key)
    if (regNo) {
      getDog(regNo).then(dog => {
        // Make sure the dog has an results array, so changes can be detected properly
        if (dog && !dog.results) {
          dog.results = []
        }
        setSelf(dog)
      })
    }
  }
}
