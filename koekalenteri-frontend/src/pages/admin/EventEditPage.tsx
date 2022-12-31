import { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue } from 'recoil'

import { EventForm } from '../../components'
import { Path } from '../../routeConfig'
import { activeEventTypesQuery, activeJudgesQuery, eventTypeClassesAtom, officialsAtom, organizersAtom } from '../recoil'

import { adminEventIdAtom, currentAdminEventQuery, DecoratedEvent } from './recoil'

export function EventEditPage({create}: {create?: boolean}) {
  const params = useParams()
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()
  const [selectedEventID, setSelectedEventID] = useRecoilState(adminEventIdAtom)
  const [event, setEvent] = useRecoilState(currentAdminEventQuery)
  const activeEventTypes = useRecoilValue(activeEventTypesQuery)
  const activeJudges = useRecoilValue(activeJudgesQuery)
  const eventTypeClasses = useRecoilValue(eventTypeClassesAtom)
  const officials = useRecoilValue(officialsAtom)
  const organizers = useRecoilValue(organizersAtom)

  useEffect(() => {
    if (create && selectedEventID) {
      setSelectedEventID(undefined)
    }
    if (params.id && params.id !== selectedEventID) {
      setSelectedEventID(params.id)
    }
  }, [create, params.id, selectedEventID, setSelectedEventID])

  const handleSave = useCallback(async () => {
    try {
      //await putEvent(event, user.getSignInUserSession()?.getIdToken().getJwtToken())
      setEvent(event as DecoratedEvent)
      navigate(Path.admin.events)
      enqueueSnackbar(t(`event.states.${event?.state || 'draft'}`, { context: 'save' }), { variant: 'info' })
      return true
    } catch (e: any) {
      enqueueSnackbar(e.message, { variant: 'error' })
      return false
    }
  }, [enqueueSnackbar, event, navigate, setEvent, t])

  const handleCancel = useCallback(async () => {
    navigate(Path.admin.events)
    return false
  }, [navigate])

  return (
    <EventForm
      event={event ?? {}}
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
