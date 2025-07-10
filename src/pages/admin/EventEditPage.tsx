import { useParams } from 'react-router'
import { useRecoilValue } from 'recoil'

import { Path } from '../../routeConfig'

import EventForm from './components/EventForm'
import EventNotFound from './components/EventNotFound'
import useEventForm from './hooks/useEventForm'
import { adminEventSelector } from './recoil'

export default function EventEditPage() {
  const { id: eventId = '' } = useParams()
  const storedEvent = useRecoilValue(adminEventSelector(eventId))
  const { event, changes, handleChange, handleSave, handleCancel } = useEventForm({
    eventId,
    storedEvent,
    onDoneRedirect: Path.admin.events,
  })

  if (!event?.id) {
    return <EventNotFound eventId={eventId} />
  }

  return (
    <EventForm event={event} changes={changes} onChange={handleChange} onSave={handleSave} onCancel={handleCancel} />
  )
}
