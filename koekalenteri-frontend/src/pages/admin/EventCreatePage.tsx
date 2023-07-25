import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Event } from 'koekalenteri-shared/model'
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
    (newState: Event) => {
      setEvent(newState)
    },
    [setEvent]
  )

  const handleSave = useCallback(() => {
    if (!event) {
      return
    }
    actions.save(event).then(
      () => {
        resetEvent()
        navigate(Path.admin.events)
        enqueueSnackbar(t(`event.states.${event?.state || 'draft'}`, { context: 'save' }), { variant: 'info' })
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

  return <EventForm event={event} changes={true} onChange={handleChange} onSave={handleSave} onCancel={handleCancel} />
}
