import { Event } from 'koekalenteri-shared/model'
import { AtomEffect, DefaultValue } from 'recoil'

import { getEvents } from '../../../api/event'

import { FilterProps } from './atoms'
import { deserializeFilter, serializeFilter } from './filters'

let loaded = false

export const remoteEventsEffect: AtomEffect<Event[]> = ({ setSelf, trigger }) => {
  const load = async() => {
    loaded = true
    const events = await getEvents()
    setSelf(events)
  }
  if (trigger === 'get' && !loaded) {
    load()
  }
}

export const urlSyncEffect: AtomEffect<FilterProps> = ({onSet, setSelf, trigger}) => {
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
