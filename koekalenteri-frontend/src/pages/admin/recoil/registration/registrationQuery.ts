import { Registration, RegistrationGroup } from "koekalenteri-shared/model";
import { selectorFamily } from "recoil";

import { getRegistration } from "../../../../api/event";
import { eventIdAtom } from "../event";

export interface RegistrationWithMutators extends Registration {
  setGroup: (group: RegistrationGroup) => void;
}

export const registrationQuery = selectorFamily<RegistrationWithMutators | null, string>({
  key: 'Registration',
  get: (registrationId) => async ({ get, getCallback }) => {
    const selectedEventId = get(eventIdAtom);
    const registration = selectedEventId && await getRegistration(selectedEventId, registrationId);
    const setGroup = getCallback(() => async (group: RegistrationGroup) => {
      console.log('woot', group);
    });
    return registration
      ? {
        ...registration,
        setGroup
      }
      : null;
  }
});
