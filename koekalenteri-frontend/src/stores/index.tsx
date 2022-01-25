import { createContext, useContext, useEffect, useState } from "react";
import { Setter, useLocalStorage, useSessionStorage } from './browser';
import { EventStore } from "./EventStore";
import { JudgeStore } from "./JudgeStore";
import { OrganizerStore } from "./OrganizerStore";

const rootStoreContext = createContext({
  eventStore: new EventStore(),
  judgeStore: new JudgeStore(),
  organizerStore: new OrganizerStore(),
});

export const useStores = () => useContext(rootStoreContext);

export const useLanguage = (defaultValue: string) => useLocalStorage('i18nextLng', defaultValue);
export const useSessionStarted = () => useSessionStorage('started', '');

export const useSessionBoolean = (key: string, defaultValue: boolean): [boolean, Setter<boolean>] => {
  const [stringValue, setStringValue] = useSessionStorage(key, defaultValue ? 'true' : '');
  const [value, setValue] = useState<boolean>(stringValue === 'true');
  useEffect(() => setStringValue(value ? 'true' : null), [value, setStringValue]);
  return [value, setValue];
}
