import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'

import { EventFilter } from './searchPage/EventFilter'
import { EventTable } from './searchPage/EventTable'
import { activeEventTypesQuery, deserializeFilter, eventFilterAtom, filteredEvents, filterJudgesQuery, filterOrganizersQuery, spaAtom } from './recoil'


export function SearchPage() {
  const [filter, setFilter] = useRecoilState(eventFilterAtom)
  const setSpa = useSetRecoilState(spaAtom)
  const organizers = useRecoilValue(filterOrganizersQuery)
  const activeJudges = useRecoilValue(filterJudgesQuery)
  const activeEventTypes = useRecoilValue(activeEventTypesQuery)
  const events = useRecoilValue(filteredEvents)
  const location = useLocation()

  useEffect(() => setSpa(true), [setSpa])
  useEffect(() => setFilter(deserializeFilter(location.search)), [location, setFilter])

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
