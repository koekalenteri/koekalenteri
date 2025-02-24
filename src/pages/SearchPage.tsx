import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { useRecoilState, useRecoilValue, useSetRecoilState, waitForAll } from 'recoil'

import { EventFilter } from './searchPage/EventFilter'
import { EventList } from './searchPage/EventList'
import {
  deserializeFilter,
  eventFilterAtom,
  filteredEventsSelector,
  filterEventClassesSelector,
  filterEventTypesSelector,
  filterJudgesSelector,
  filterOrganizersSelector,
  spaAtom,
} from './recoil'

export function SearchPage() {
  const [filter, setFilter] = useRecoilState(eventFilterAtom)
  const setSpa = useSetRecoilState(spaAtom)
  const [organizers, activeJudges, activeEventTypes, activeEventClasses, events] = useRecoilValue(
    waitForAll([
      filterOrganizersSelector,
      filterJudgesSelector,
      filterEventTypesSelector,
      filterEventClassesSelector,
      filteredEventsSelector,
    ])
  )
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
      <EventFilter
        eventTypes={activeEventTypes}
        eventClasses={activeEventClasses}
        organizers={organizers}
        judges={activeJudges}
        filter={filter}
        onChange={setFilter}
      />
      <EventList events={events} />
    </>
  )
}
