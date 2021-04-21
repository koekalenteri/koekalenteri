import { createContext } from "react";
import { TestStore } from "./TestStore";

export const rootStoreContext = createContext({
  testStore: new TestStore()
});
