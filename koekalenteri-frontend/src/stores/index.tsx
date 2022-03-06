import { createContext, useContext, useMemo } from "react";
import { Setter, useLocalStorage, useSessionStorage } from './browser';
import { PublicStore } from "./PublicStore";
import { PrivateStore } from "./PrivateStore";

const rootStoreContext = createContext({
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
