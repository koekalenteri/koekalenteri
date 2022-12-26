import { RegistrationGroup } from "koekalenteri-shared/model";
import { selector } from "recoil";

import { eventClassAtom } from "../event/eventClassAtom";

import { currentEventRegistrationsQuery } from "./currentEventRegistrationsQuery";
import { RegistrationWithMutators } from "./registrationQuery";


export const currentEventClassRegistrationsQuery = selector<RegistrationWithMutators[]>({
  key: 'CurrentEventClassRegistrations',
  get: ({ get, getCallback }) => {
    const eventClass = get(eventClassAtom);
    const registrations = get(currentEventRegistrationsQuery);
    return registrations.filter(r => r.class === eventClass).map(r => ({
      ...r,
      setGroup: getCallback(() => async (group: RegistrationGroup) => {
        console.log('setGroup', group, r.id);
      })
    }));
  },
});
