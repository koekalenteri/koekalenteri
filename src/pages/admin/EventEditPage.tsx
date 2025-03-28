import type { DogEvent } from '../../types'

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import { useSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { hasChanges } from '../../lib/utils'
import { Path } from '../../routeConfig'

import EventForm from './components/EventForm'
import { adminEditableEventByIdAtom, adminEventSelector, useAdminEventActions } from './recoil'

export default function EventEditPage() {
  const { id: eventId = '' } = useParams()
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()

  const actions = useAdminEventActions()
  const storedEvent = useRecoilValue(adminEventSelector(eventId))
  const [event, setEvent] = useRecoilState(adminEditableEventByIdAtom(eventId))
  const resetEvent = useResetRecoilState(adminEditableEventByIdAtom(eventId))
  const [changes, setChanges] = useState<boolean>(hasChanges(storedEvent, event))

  const handleChange = useCallback(
    (newState: DogEvent) => {
      setChanges(hasChanges(storedEvent, newState))
      setEvent(newState)
    },
    [setEvent, storedEvent]
  )

  const handleSave = useCallback(async () => {
    if (!event) {
      return
    }
    try {
      const saved = await actions.save(event)
      resetEvent()
      navigate(Path.admin.events)
      enqueueSnackbar(t(`event.states.${saved?.state ?? 'draft'}`, { context: 'save', defaultValue: '' }), {
        variant: 'info',
      })
    } catch (error) {
      console.error(error)
    }
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
