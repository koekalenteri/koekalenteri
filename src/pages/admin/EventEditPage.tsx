import { useAtomValue } from 'jotai'
import { useParams } from 'react-router'
import { useEventSubscription } from '../../hooks/useEventSubscription'
import { useUnsavedChangesWarning } from '../../hooks/useUnsavedChangesWarning'
import { Path } from '../../routeConfig'
import DroppedTasksDialog from './components/DroppedTasksDialog'
import EventForm from './components/EventForm'
import EventNotFound from './components/EventNotFound'
import OtherViewers from './eventViewPage/OtherViewers'
import useEventForm from './hooks/useEventForm'
import { adminEventAtom } from './state'
import { useAdminEventScope } from './state/eventScope'

export default function EventEditPage() {
  const { id: eventId = '' } = useParams()
  useAdminEventScope(eventId)
  const { viewers } = useEventSubscription(eventId)
  const storedEvent = useAtomValue(adminEventAtom(eventId))
  const { event, changes, canSave, discardChanges, dropsDialogProps, handleChange, handleSave, handleCancel } =
    useEventForm({
      eventId,
      form: 'edit',
      onDoneRedirect: Path.admin.events,
      storedEvent,
    })

  // The draft lives in session storage, so leaving unsaved asks first, and the answer to leave drops this
  // page's draft and only that, as on the posts and teams pages (KOE-1700).
  useUnsavedChangesWarning(canSave, discardChanges)

  if (!event?.id) {
    return <EventNotFound />
  }

  return (
    <>
      <OtherViewers viewers={viewers} />
      <EventForm
        event={event}
        changes={changes}
        canSave={canSave}
        onChange={handleChange}
        onSave={handleSave}
        onCancel={handleCancel}
      />
      <DroppedTasksDialog {...dropsDialogProps} />
    </>
  )
}
