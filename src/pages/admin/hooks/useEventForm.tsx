import type { DogEvent } from '../../../types'
import { useSnackbar } from 'notistack'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useRecoilState, useResetRecoilState } from 'recoil'
import { hasChanges } from '../../../lib/utils'
import { adminEditableEventByIdAtom, adminNewEventAtom, useAdminEventActions } from '../recoil'

type EventFormOptions = {
  eventId?: string
  storedEvent?: DogEvent | null
  onDoneRedirect?: string
}

/**
 * A hook that handles common event form operations for both create and edit scenarios
 */
export default function useEventForm(options: EventFormOptions = {}) {
  const { eventId, storedEvent = null, onDoneRedirect } = options

  const [event, setEvent] = useRecoilState(eventId ? adminEditableEventByIdAtom(eventId) : adminNewEventAtom)
  const resetEvent = useResetRecoilState(eventId ? adminEditableEventByIdAtom(eventId) : adminNewEventAtom)

  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()
  const actions = useAdminEventActions()

  // In create mode, always show as changed
  // In edit mode, compare with original event
  const [changes, setChanges] = useState<boolean>(storedEvent ? hasChanges(storedEvent, event) : true)

  const handleChange = useCallback(
    (newState: DogEvent) => {
      // Update change tracking if in edit mode
      if (storedEvent) {
        setChanges(hasChanges(storedEvent, newState))
      }

      // Always update modification timestamp
      newState.modifiedAt = new Date()

      // Update state
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
      if (onDoneRedirect) {
        navigate(onDoneRedirect)
      }
      enqueueSnackbar(t(`event.states.${saved?.state ?? 'draft'}`, { context: 'save', defaultValue: '' }), {
        variant: 'info',
      })
    } catch (error) {
      console.error(error)
    }
  }, [actions, enqueueSnackbar, event, navigate, onDoneRedirect, resetEvent, t])

  const handleCancel = useCallback(() => {
    resetEvent()
    if (onDoneRedirect) {
      navigate(onDoneRedirect)
    }
  }, [navigate, resetEvent, onDoneRedirect])

  return {
    changes,
    event,
    handleCancel,
    handleChange,
    handleSave,
  }
}
