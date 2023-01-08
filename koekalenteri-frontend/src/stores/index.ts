import { createContext, useContext } from "react"
import { configure } from "mobx"

import { RootStore } from "./RootStore"

// Make sure TS is configured properly for MobX
if (!new class { x: any }().hasOwnProperty('x')) throw new Error('Transpiler is not configured correctly')

// Configure MobX warnings (but not in tests, to reduce warnings)
const notInTest = process.env.NODE_ENV !== 'test'
configure({
  enforceActions: "always",
  computedRequiresReaction: notInTest,
  reactionRequiresObservable: notInTest,
  observableRequiresReaction: notInTest,
})

export const stores = {
  rootStore: new RootStore(),
}

const rootStoreContext = createContext(stores)

export const useStores = () => useContext(rootStoreContext)
