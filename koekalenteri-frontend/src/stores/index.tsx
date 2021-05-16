import { createContext } from "react";
import { EventStore } from "./EventStrore";

export const rootStoreContext = createContext({
  eventStore: new EventStore()
});
