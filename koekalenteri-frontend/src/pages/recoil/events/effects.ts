import { Event } from 'koekalenteri-shared/model'
import { AtomEffect, DefaultValue } from 'recoil'

import { getEvents } from '../../../api/event'

import { FilterProps } from './atoms'
import { deserializeFilter, serializeFilter } from './filters'

export const remoteEventsEffect: AtomEffect<Event[]> = ({ setSelf, trigger }) => {
  if (trigger === 'get') {
    getEvents().then(setSelf)
  }
}

export const urlSyncEffect: AtomEffect<FilterProps> = ({setSelf, onSet, trigger}) => {
  if (trigger === 'get') {
    setSelf(deserializeFilter(window.location.search))
  }

  onSet((newValue, oldValue) => {
    const newSearch = serializeFilter(newValue)
    const oldSearch = oldValue instanceof DefaultValue ? undefined : serializeFilter(oldValue)
    if (oldSearch === newSearch) {
      return
    }
    const newUrl = window.location.origin + window.location.pathname + '?' + newSearch
    window.history.pushState({path: newUrl}, '', newUrl)
  })
}
