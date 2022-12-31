import { Registration } from "koekalenteri-shared/model"
import { selector } from "recoil"

import { getRegistration } from "../../../api/event"
import { eventIdAtom } from "../events/atoms"

import { registrationIdAtom } from "./atoms"


export const registrationQuery = selector<Registration | undefined>({
  key: 'registration',
  get: ({ get }) => {
    const eventId = get(eventIdAtom)
    const registrationId = get(registrationIdAtom)
    if (eventId && registrationId) {
      return getRegistration(eventId, registrationId)
    }
  },
})
