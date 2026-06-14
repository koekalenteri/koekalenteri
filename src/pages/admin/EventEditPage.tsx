import { useParams } from 'react-router'
import { useRecoilValue } from 'recoil'
import { useEventSubscription } from '../../hooks/useEventSubscription'
import { Path } from '../../routeConfig'
import EventForm from './components/EventForm'
import EventNotFound from './components/EventNotFound'
import OtherViewers from './eventViewPage/OtherViewers'
import useEventForm from './hooks/useEventForm'
import { adminEventSelector } from './recoil'

export default function EventEditPage() {
  const { id: eventId = '' } = useParams()
  const { viewers } = useEventSubscription(eventId)
  const storedEvent = useRecoilValue(adminEventSelector(eventId))
  const { event, changes, handleChange, handleSave, handleCancel } = useEventForm({
    eventId,
    onDoneRedirect: Path.admin.events,
    storedEvent,
  })

  if (!event?.id) {
    return <EventNotFound eventId={eventId} />
  }

  return (
    <>
      <OtherViewers viewers={viewers} />
      <EventForm event={event} changes={changes} onChange={handleChange} onSave={handleSave} onCancel={handleCancel} />
    </>
  )
}
