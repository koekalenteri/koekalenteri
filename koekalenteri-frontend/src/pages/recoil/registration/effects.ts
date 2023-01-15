import { Registration } from "koekalenteri-shared/model"
import { AtomEffect } from "recoil"

import { getRegistration } from "../../../api/registration"
import { getParamFromFamilyKey } from "../effects"
import { eventIdAtom } from "../events"

export const remoteRegistrationEffect: AtomEffect<Registration | undefined> = ({ node, getPromise, setSelf, trigger }) => {
  if (trigger === 'get') {
    getPromise(eventIdAtom).then(eventId => {
      const registrationId = getParamFromFamilyKey(node.key)
      if (eventId && registrationId) {
        getRegistration(eventId, registrationId).then(setSelf)
      }
    })
  }
}
