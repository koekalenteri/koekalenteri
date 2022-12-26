import { Registration } from "koekalenteri-shared/model";
import { selector } from "recoil";

import { eventIdAtom } from "../event";

import { regisrationsQuery } from "./registrationsQuery";

export const currentEventRegistrationsQuery = selector<Registration[]>({
  key: 'CurrentEventRegistrationsQuery',
  get: ({ get }) => {
    const currentEventId = get(eventIdAtom);
    return currentEventId ? get(regisrationsQuery(currentEventId)) : [];
  }
});
