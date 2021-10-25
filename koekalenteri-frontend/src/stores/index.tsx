import { createContext } from "react";
import { EventStore } from "./EventStrore";
import { JudgeStore } from "./JudgeStore";
import { OrganizerStore } from "./OrganizerStore";

export const rootStoreContext = createContext({
  eventStore: new EventStore(),
  judgeStore: new JudgeStore(),
  organizerStore: new OrganizerStore(),
});
