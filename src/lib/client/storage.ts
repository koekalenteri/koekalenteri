export const getStorageKeysStartingWith = (prefixes: string[]) => {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    for (const prefix of prefixes) {
      if (key?.startsWith(prefix)) {
        keys.push(key)
        break
      }
    }
  }

  return keys
}
