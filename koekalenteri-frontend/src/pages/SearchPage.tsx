import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'

import { EventFilter } from './searchPage/EventFilter'
import { EventTable } from './searchPage/EventTable'
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
  const organizers = useRecoilValue(filterOrganizersSelector)
  const activeJudges = useRecoilValue(filterJudgesSelector)
  const activeEventTypes = useRecoilValue(filterEventTypesSelector)
  const activeEventClasses = useRecoilValue(filterEventClassesSelector)
  const events = useRecoilValue(filteredEventsSelector)
  const location = useLocation()

  useEffect(() => setSpa(true), [setSpa])
  useEffect(() => setFilter(deserializeFilter(location.search)), [location, setFilter])

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
      <EventTable events={events} />
    </>
  )
}
