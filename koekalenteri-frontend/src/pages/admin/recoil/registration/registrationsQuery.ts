import { Registration } from "koekalenteri-shared/model"
import { selectorFamily } from "recoil"

import { getRegistrations } from "../../../../api/event"

export const regisrationsQuery = selectorFamily<Registration[], string>({
  key: 'registrationsQuery',
  get: (eventId) => async () => getRegistrations(eventId),
})
