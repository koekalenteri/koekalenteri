import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { Event } from 'koekalenteri-shared/model'
import { useSnackbar } from 'notistack'
import { useRecoilValue } from 'recoil'

import { Path } from '../../routeConfig'
import { activeEventTypesSelector, activeJudgesSelector, eventTypeClassesAtom } from '../recoil'

import EventForm from './eventEditPage/EventForm'
import { officialsAtom, organizersAtom, useAdminEventActions } from './recoil'

export default function EventEditPage({create}: {create?: boolean}) {
  const params = useParams()
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()
  const activeEventTypes = useRecoilValue(activeEventTypesSelector)
  const activeJudges = useRecoilValue(activeJudgesSelector)
  const eventTypeClasses = useRecoilValue(eventTypeClassesAtom)
  const officials = useRecoilValue(officialsAtom)
  const organizers = useRecoilValue(organizersAtom)

  const actions = useAdminEventActions()

  const handleSave = useCallback(async (event: Partial<Event>) => {
    actions.save(event)
    navigate(Path.admin.events)
    enqueueSnackbar(t(`event.states.${event?.state || 'draft'}`, { context: 'save' }), { variant: 'info' })
  }, [actions, enqueueSnackbar, navigate, t])

  const handleCancel = useCallback(async () => {
    navigate(Path.admin.events)
  }, [navigate])

  return (
    <EventForm
      eventId={params.id}
      eventTypes={activeEventTypes.map(et => et.eventType)}
      eventTypeClasses={eventTypeClasses}
      judges={activeJudges}
      officials={officials}
      organizers={organizers}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  )
}
