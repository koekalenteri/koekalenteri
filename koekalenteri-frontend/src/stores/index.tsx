import { createContext } from "react";
import { EventStore } from "./EventStrore";
import { JudgeStore } from "./JudgeStore";

export const rootStoreContext = createContext({
  eventStore: new EventStore(),
  judgeStore: new JudgeStore()
});
