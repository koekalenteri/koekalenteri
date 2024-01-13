import type { DogEvent } from '../../types'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useSnackbar } from 'notistack'
import { useRecoilState, useResetRecoilState } from 'recoil'

import { Path } from '../../routeConfig'

import EventForm from './components/EventForm'
import { newEventAtom, useAdminEventActions } from './recoil'

export default function EventCreatePage() {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()

  const actions = useAdminEventActions()
  const [event, setEvent] = useRecoilState(newEventAtom)
  const resetEvent = useResetRecoilState(newEventAtom)

  const handleChange = useCallback(
    (newState: DogEvent) => {
      newState.modifiedAt = new Date()
      setEvent(newState)
    },
    [setEvent]
  )

  const handleSave = useCallback(async () => {
    if (!event) {
      return
    }
    try {
      const saved = await actions.save(event)
      resetEvent()
      navigate(Path.admin.events)
      enqueueSnackbar(t(`event.states.${saved.state ?? 'draft'}`, { context: 'save', defaultValue: '' }), {
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

  return <EventForm event={event} changes={true} onChange={handleChange} onSave={handleSave} onCancel={handleCancel} />
}
