import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { EventFilter } from './searchPage/EventFilter'
import { EventList } from './searchPage/EventList'
import {
  DateHandler,
  deserializeFilter,
  eventFilterAtom,
  eventsLoadingAtom,
  filterEventClassesAtom,
  filterEventTypesAtom,
  filteredEventsAtom,
  filterJudgesAtom,
  filterOrganizersAtom,
  spaAtom,
} from './state'

const searchResultsAtom = atom(
  (get) =>
    [
      get(filterOrganizersAtom),
      get(filterJudgesAtom),
      get(filterEventTypesAtom),
      get(filterEventClassesAtom),
      get(filteredEventsAtom),
    ] as const
)

export function SearchPage() {
  const [filter, setFilter] = useAtom(eventFilterAtom)
  const setSpa = useSetAtom(spaAtom)
  const [organizers, activeJudges, activeEventTypes, activeEventClasses, events] = useAtomValue(searchResultsAtom)
  const loading = useAtomValue(eventsLoadingAtom)
  const location = useLocation()

  useEffect(() => setSpa(true), [setSpa])
  useEffect(() => {
    // Only replace the filter based on url, don't clear it
    if (location.search) {
      setFilter(deserializeFilter(location.search))
    }
  }, [location, setFilter])

  return (
    <>
      <DateHandler />
      <EventFilter
        eventTypes={activeEventTypes}
        eventClasses={activeEventClasses}
        organizers={organizers}
        judges={activeJudges}
        eventCount={events.length}
        filter={filter}
        onChange={setFilter}
      />
      <EventList events={events} loading={loading} />
    </>
  )
}
