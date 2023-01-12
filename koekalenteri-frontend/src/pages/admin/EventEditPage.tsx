import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Event } from 'koekalenteri-shared/model'
import { useSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'
import { getDiff } from 'recursive-diff'

import { Path } from '../../routeConfig'
import { activeEventTypesSelector, activeJudgesSelector, eventTypeClassesAtom } from '../recoil'

import EventForm from './eventEditPage/EventForm'
import { adminEventSelector, editableEventByIdAtom, officialsAtom, organizersAtom, useAdminEventActions } from './recoil'

export default function EventEditPage() {
  const {id: eventId = ''} = useParams()
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()
  const activeEventTypes = useRecoilValue(activeEventTypesSelector)
  const activeJudges = useRecoilValue(activeJudgesSelector)
  const eventTypeClasses = useRecoilValue(eventTypeClassesAtom)
  const officials = useRecoilValue(officialsAtom)
  const organizers = useRecoilValue(organizersAtom)

  const actions = useAdminEventActions()
  const storedEvent = useRecoilValue(adminEventSelector(eventId))
  const [event, setEvent] = useRecoilState(editableEventByIdAtom(eventId))
  const resetEvent = useResetRecoilState(editableEventByIdAtom(eventId))
  const [changes, setChanges] = useState<boolean>(getDiff(storedEvent, event).length > 0)

  const handleChange = useCallback((newState: Event) => {
    const diff = getDiff(storedEvent, newState)
    console.log('changes', diff)
    setChanges(diff.length > 0)
    setEvent(newState)
  }, [setEvent, storedEvent])

  const handleSave = useCallback(async () => {
    if (!event) {
      return
    }
    await actions.save(event)
    resetEvent()
    navigate(Path.admin.events)
    enqueueSnackbar(t(`event.states.${event?.state || 'draft'}`, { context: 'save' }), { variant: 'info' })
  }, [actions, enqueueSnackbar, event, navigate, resetEvent, t])

  const handleCancel = useCallback(async () => {
    resetEvent()
    navigate(Path.admin.events)
  }, [navigate, resetEvent])

  if (!event) {
    return <div>event not found</div>
  }

  return (
    <EventForm
      event={event}
      changes={changes}
      eventTypes={activeEventTypes.map(et => et.eventType)}
      eventTypeClasses={eventTypeClasses}
      judges={activeJudges}
      officials={officials}
      organizers={organizers}
      onChange={handleChange}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  )
}
