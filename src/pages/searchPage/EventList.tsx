import type { PublicDogEvent } from '../../types'
import LoadingIndicator from '../components/LoadingIndicator'
import { EmptyResult } from './eventList/EmptyResult'
import { EventListItem } from './eventList/EventListItem'

interface Props {
  readonly events: PublicDogEvent[]
  readonly loading?: boolean
}

export const EventList = ({ events, loading }: Props) => {
  if (events.length) {
    return events.map((event, i) => <EventListItem key={event.id} event={event} odd={i % 2 === 1} />)
  }
  if (loading) {
    return <LoadingIndicator />
  }
  return <EmptyResult />
}
