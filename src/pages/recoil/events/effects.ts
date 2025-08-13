import type { AtomEffect } from 'recoil'
import type { PublicDogEvent } from '../../../types'
import type { FilterProps } from './types'

import { DefaultValue } from 'recoil'

import { getEvents } from '../../../api/event'

import { deserializeFilter, serializeFilter } from './filters'

const eventSort = (a: PublicDogEvent, b: PublicDogEvent) => a.startDate.valueOf() - b.startDate.valueOf()

export const remoteEventsEffect: AtomEffect<PublicDogEvent[]> = ({ setSelf, trigger }) => {
  if (trigger === 'get') {
    setSelf(getEvents().then((events) => events.sort(eventSort)))
  }
}

export const urlSyncEffect: AtomEffect<FilterProps> = ({ node, onSet, setSelf, trigger }) => {
  if (trigger === 'get') {
    // Only sync when the search is provided in url (or atleast the ? to clear)
    if (window.location.search || window.location.href.endsWith('?')) {
      setSelf(deserializeFilter(window.location.search))
    } else {
      // When not provided, look up previous value from session
      const sessionValue = sessionStorage.getItem(node.key)
      if (sessionValue !== null) {
        setSelf(deserializeFilter(sessionValue))
        const newUrl = window.location.origin + window.location.pathname + '?' + sessionValue
        window.history.pushState({ path: newUrl }, '', newUrl)
      }
    }
  }

  onSet((newValue, oldValue) => {
    const newSearch = serializeFilter(newValue)
    const oldSearch = oldValue instanceof DefaultValue ? undefined : serializeFilter(oldValue)
    if (oldSearch === newSearch) {
      return
    }
    const newUrl = window.location.origin + window.location.pathname + '?' + newSearch
    window.history.pushState({ path: newUrl }, '', newUrl)
    // Save the value in session, so it can be restored when returning from different route
    sessionStorage.setItem(node.key, newSearch)
  })
}
