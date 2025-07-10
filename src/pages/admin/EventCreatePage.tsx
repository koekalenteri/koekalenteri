import { Path } from '../../routeConfig'

import EventForm from './components/EventForm'
import useEventForm from './hooks/useEventForm'

export default function EventCreatePage() {
  const { event, changes, handleChange, handleSave, handleCancel } = useEventForm({ onDoneRedirect: Path.admin.events })

  if (!event) {
    return null
  }

  return (
    <EventForm event={event} changes={changes} onChange={handleChange} onSave={handleSave} onCancel={handleCancel} />
  )
}
