import { useCallback, useEffect, useState } from "react";

export type Setter<T> = React.Dispatch<React.SetStateAction<T>>;

const logger = console.log;

function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch (e) {
    logger(e);
  }
  return null;
}

function writeStorage(storage: Storage, key: string, value: string | null): void {
  try {
    if (!value) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, value);
    }
  } catch (e) {
    logger(e);
  }
}

function useStorage(storage: Storage, key: string, defaultValue: string): [string | null, Setter<string | null>] {
  const [storedValue, setValue] = useState<string | null>(() => readStorage(storage, key) || defaultValue);
  const handleStorageChange = useCallback((e: StorageEvent) => {
    if (e.storageArea === storage && e.key === key) {
      setValue(e.newValue);
    }
  }, [storage, key]);

  useEffect(() => writeStorage(storage, key, storedValue), [storage, key, storedValue]);

  useEffect(() => {
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [handleStorageChange]);

  return [storedValue, setValue];
}

export const useLocalStorage = (key: string, defaultValue: string) => useStorage(localStorage, key, defaultValue);
export const useSessionStorage = (key: string, defaultValue: string) => useStorage(sessionStorage, key, defaultValue);
