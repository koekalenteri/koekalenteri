import { AtomEffect } from "recoil";

const parse = (value: string | null) => {
  let parsed
  try {
    if (value !== null) {
      parsed = JSON.parse(value)
    }
  } catch(e) {
    console.warn('JSON parse error', e)
  }
  return parsed
}

export const storageEffect: AtomEffect<any> = ({node, setSelf, onSet}) => {
  const savedValue = localStorage.getItem(node.key)
  if (savedValue !== null) {
    const parsed = parse(savedValue)
    // Using setTimeout to avoid "Cannot update a component (`Batcher`) while rendering a different component.."
    setTimeout(() => setSelf(parsed), 0);
  }

  onSet((newValue, _, isReset) => {
    if (isReset || newValue === null || newValue === undefined) {
      localStorage.removeItem(node.key)
    } else {
      localStorage.setItem(node.key, JSON.stringify(newValue))
    }
  })

  const handleStorageChange = (e: StorageEvent) => {
    if (e.storageArea === localStorage && e.key === node.key) {
      const parsed = parse(e.newValue)
      console.log('storage change', e.newValue, parsed)
      // Using setTimeout to avoid "Cannot update a component (`Batcher`) while rendering a different component.."
      setTimeout(() => setSelf(parsed), 0);
    }
  }

  window.addEventListener('storage', handleStorageChange);

  return () => window.removeEventListener("storage", handleStorageChange);
}
