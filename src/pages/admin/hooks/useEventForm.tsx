import type { DogEvent, Patch } from '../../../types'
import { useSnackbar } from 'notistack'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useRecoilState, useResetRecoilState } from 'recoil'
import { getChanges, isEmptyObject } from '../../../lib/utils'
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
  const initialEvent = useRef(event)

  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()
  const actions = useAdminEventActions()

  const createMode = !storedEvent
  const [changes, setChanges] = useState<Patch<DogEvent>>(getChanges(storedEvent ?? initialEvent.current, event))
  const [canSave, setCanSave] = useState<boolean>(createMode || !isEmptyObject(changes))

  const handleChange = useCallback(
    (newState: Patch<DogEvent>) => {
      const newChanges = getChanges(storedEvent ?? initialEvent.current, newState as DogEvent)
      setChanges(newChanges)
      setCanSave(!storedEvent || !isEmptyObject(newChanges))

      // Always update modification timestamp
      newState.modifiedAt = new Date()

      // Update state
      setEvent(newState as DogEvent)
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
    canSave,
    changes,
    event,
    handleCancel,
    handleChange,
    handleSave,
  }
}
