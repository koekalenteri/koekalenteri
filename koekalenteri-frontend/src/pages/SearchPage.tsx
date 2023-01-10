import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'

import { EventFilter } from './searchPage/EventFilter'
import { EventTable } from './searchPage/EventTable'
import { activeEventTypesSelector, deserializeFilter, eventFilterAtom, filteredEventsSelector, filterJudgesSelector, filterOrganizersSelector, spaAtom } from './recoil'


export function SearchPage() {
  const [filter, setFilter] = useRecoilState(eventFilterAtom)
  const setSpa = useSetRecoilState(spaAtom)
  const organizers = useRecoilValue(filterOrganizersSelector)
  const activeJudges = useRecoilValue(filterJudgesSelector)
  const activeEventTypes = useRecoilValue(activeEventTypesSelector)
  const events = useRecoilValue(filteredEventsSelector)
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
