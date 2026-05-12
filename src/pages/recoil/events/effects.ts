import type { AtomEffect } from 'recoil'
import type { FilterProps } from './types'
import { DefaultValue } from 'recoil'
import { deserializeFilter, serializeFilter } from './filters'

export const urlSyncEffect: AtomEffect<FilterProps> = ({ node, onSet, setSelf, trigger }) => {
  if (trigger === 'get') {
    // Only sync when the search is provided in url (or atleast the ? to clear)
    if (globalThis.location.search || globalThis.location.href.endsWith('?')) {
      setSelf(deserializeFilter(globalThis.location.search))
    } else {
      // When not provided, look up previous value from session
      const sessionValue = sessionStorage.getItem(node.key)
      if (sessionValue !== null) {
        setSelf(deserializeFilter(sessionValue))
        const newUrl = `${globalThis.location.origin + globalThis.location.pathname}?${sessionValue}`
        globalThis.history.pushState({ path: newUrl }, '', newUrl)
      }
    }
  }

  onSet((newValue, oldValue) => {
    const newSearch = serializeFilter(newValue)
    const oldSearch = oldValue instanceof DefaultValue ? undefined : serializeFilter(oldValue)
    if (oldSearch === newSearch) {
      return
    }
    const newUrl = `${globalThis.location.origin + globalThis.location.pathname}?${newSearch}`
    globalThis.history.pushState({ path: newUrl }, '', newUrl)
    // Save the value in session, so it can be restored when returning from different route
    sessionStorage.setItem(node.key, newSearch)
  })
}
