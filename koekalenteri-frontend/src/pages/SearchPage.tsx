import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useRecoilState, useRecoilValue } from 'recoil'

import { EventFilter } from './searchPage/EventFilter'
import { EventTable } from './searchPage/EventTable'
import { activeEventTypesQuery, deserializeFilter, eventFilterAtom, filteredEvents, filterJudgesQuery, filterOrganizersQuery } from './recoil'


export function SearchPage() {
  const organizers = useRecoilValue(filterOrganizersQuery)
  const activeJudges = useRecoilValue(filterJudgesQuery)
  const activeEventTypes = useRecoilValue(activeEventTypesQuery)
  const events = useRecoilValue(filteredEvents)
  const [filter, setFilter] = useRecoilState(eventFilterAtom)
  const location = useLocation()

  useEffect(() => {
    setFilter(deserializeFilter(location.search))
  }, [location, setFilter])

  return (
    <>
      <EventFilter
        eventTypes={activeEventTypes.map(et => et.eventType)}
        organizers={organizers}
        judges={activeJudges}
        filter={filter}
        onChange={setFilter}
      />
      <EventTable events={events} />
    </>
  )
}
