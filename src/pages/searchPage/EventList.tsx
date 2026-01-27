import type { PublicDogEvent } from '../../types'

import { EmptyResult } from './eventList/EmptyResult'
import { EventListItem } from './eventList/EventListItem'

interface Props {
  readonly events: PublicDogEvent[]
}

export const EventList = ({ events }: Props) =>
  events.length ? (
    <>
      {events.map((event, i) => (
        <EventListItem key={event.id} event={event} odd={i % 2 === 1} />
      ))}
    </>
  ) : (
    <EmptyResult />
  )
