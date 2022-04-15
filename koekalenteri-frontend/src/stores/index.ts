import { createContext, useContext, useMemo } from "react";
import { Setter, useLocalStorage, useSessionStorage } from './browser';
import { PublicStore } from "./PublicStore";
import { PrivateStore } from "./PrivateStore";
import { RootStore } from "./RootStore";
import { configure } from "mobx";

// Make sure TS is configured properly for MobX
if (!new class { x: any }().hasOwnProperty('x')) throw new Error('Transpiler is not configured correctly');

configure({
  enforceActions: "always",
  computedRequiresReaction: true,
  reactionRequiresObservable: true,
  observableRequiresReaction: process.env.NODE_ENV !== 'test'
});

const rootStoreContext = createContext({
  rootStore: new RootStore(),
  publicStore: new PublicStore(),
  privateStore: new PrivateStore(),
});

export const useStores = () => useContext(rootStoreContext);

export const useLanguage = (defaultValue: string) => useLocalStorage('i18nextLng', defaultValue);
export const useSessionStarted = () => useSessionStorage('started', '');

export const useSessionBoolean = (key: string, defaultValue: boolean): [boolean, Setter<boolean>] => {
  const [stringValue, setStringValue] = useSessionStorage(key, defaultValue ? 'true' : '');
  const value = useMemo<boolean>(() => stringValue === 'true', [stringValue]);
  const setValue: Setter<boolean> = (newValue) => setStringValue(newValue ? 'true' : null);
  return [value, setValue];
}

export { useLocalStorage, useSessionStorage };
