import type { DogEvent } from '../../types'

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import { useSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { hasChanges } from '../../lib/utils'
import { Path } from '../../routeConfig'

import EventForm from './components/EventForm'
import { adminEventSelector, editableEventByIdAtom, useAdminEventActions } from './recoil'

export default function EventEditPage() {
  const { id: eventId = '' } = useParams()
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()

  const actions = useAdminEventActions()
  const storedEvent = useRecoilValue(adminEventSelector(eventId))
  const [event, setEvent] = useRecoilState(editableEventByIdAtom(eventId))
  const resetEvent = useResetRecoilState(editableEventByIdAtom(eventId))
  const [changes, setChanges] = useState<boolean>(hasChanges(storedEvent, event))

  const handleChange = useCallback(
    (newState: DogEvent) => {
      setChanges(hasChanges(storedEvent, newState))
      setEvent(newState)
    },
    [setEvent, storedEvent]
  )

  const handleSave = useCallback(() => {
    if (!event) {
      return
    }
    actions.save(event).then(
      (saved) => {
        resetEvent()
        navigate(Path.admin.events)
        enqueueSnackbar(t(`event.states.${saved?.state || 'draft'}`, '', { context: 'save' }), { variant: 'info' })
      },
      (reason) => {
        console.error(reason)
      }
    )
  }, [actions, enqueueSnackbar, event, navigate, resetEvent, t])

  const handleCancel = useCallback(() => {
    resetEvent()
    navigate(Path.admin.events)
  }, [navigate, resetEvent])

  if (!event) {
    return <div>event {eventId} not found</div>
  }

  return (
    <EventForm event={event} changes={changes} onChange={handleChange} onSave={handleSave} onCancel={handleCancel} />
  )
}
