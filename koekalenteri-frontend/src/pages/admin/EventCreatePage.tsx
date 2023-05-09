import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Event } from 'koekalenteri-shared/model'
import { useSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { Path } from '../../routeConfig'
import { activeEventTypesSelector, activeJudgesSelector, eventTypeClassesAtom } from '../recoil'

import EventForm from './eventEditPage/EventForm'
import { adminUserOrganizersSelector } from './recoil/user'
import { newEventAtom, officialsAtom, useAdminEventActions } from './recoil'

export default function EventCreatePage() {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()
  const activeEventTypes = useRecoilValue(activeEventTypesSelector)
  const activeJudges = useRecoilValue(activeJudgesSelector)
  const eventTypeClasses = useRecoilValue(eventTypeClassesAtom)
  const officials = useRecoilValue(officialsAtom)
  const organizers = useRecoilValue(adminUserOrganizersSelector)

  const actions = useAdminEventActions()
  const [event, setEvent] = useRecoilState(newEventAtom)
  const resetEvent = useResetRecoilState(newEventAtom)

  const handleChange = useCallback(
    (newState: Event) => {
      setEvent(newState)
    },
    [setEvent]
  )

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

  return (
    <EventForm
      event={event}
      changes={true}
      eventTypes={activeEventTypes.map((et) => et.eventType)}
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
