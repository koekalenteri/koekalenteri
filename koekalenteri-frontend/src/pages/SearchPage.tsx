import { useSearchParams } from 'react-router-dom'
import { toJS } from 'mobx'
import { observer } from 'mobx-react-lite'

import { EventFilter, serializeFilter } from '../components'
import { EventContainer } from '../layout'
import { useStores } from '../stores'
import { FilterProps } from '../stores/PublicStore'

export const SearchPage = observer(function SearchPage() {
  const { rootStore, publicStore } = useStores()
  const [, setSearchParams] = useSearchParams()

  const organizers = toJS(rootStore.organizerStore.organizers)
  const judges = rootStore.judgeStore.activeJudges.map(j => { return {...j}})
  const eventTypes = toJS(rootStore.eventTypeStore.activeEventTypes)
  const filter = toJS(publicStore.filter)

  const handleChange = (filter: FilterProps) => {
    setSearchParams(serializeFilter(filter))
  }

  return (
    <>
      <EventFilter organizers={organizers} judges={judges} filter={filter} eventTypes={eventTypes} onChange={handleChange} />
      <EventContainer store={publicStore} />
    </>
  )
})
