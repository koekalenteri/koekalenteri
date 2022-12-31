import { useRecoilState, useRecoilValue } from 'recoil'
import { RecoilURLSync } from 'recoil-sync'

import { deserializeFilter, EventFilter, EventTable, serializeFilter } from '../components'

import { activeEventTypesQuery, eventFilterAtom, filteredEvents, filterJudgesQuery, filterOrganizersQuery } from './recoil'


export function SearchPage() {
  const organizers = useRecoilValue(filterOrganizersQuery)
  const activeJudges = useRecoilValue(filterJudgesQuery)
  const activeEventTypes = useRecoilValue(activeEventTypesQuery)
  const events= useRecoilValue(filteredEvents)
  const [filter, setFilter] = useRecoilState(eventFilterAtom)

  return (
    <RecoilURLSync location={{ part: 'search' }} serialize={serializeFilter} deserialize={deserializeFilter}>
      <EventFilter
        eventTypes={activeEventTypes.map(et => et.eventType)}
        organizers={organizers}
        judges={activeJudges}
        filter={filter}
        onChange={setFilter}
      />
      <EventTable events={events} />
    </RecoilURLSync>
  )
}
