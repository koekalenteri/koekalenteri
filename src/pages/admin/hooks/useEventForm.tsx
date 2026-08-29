import type { DogEvent, Patch } from '../../../types'
import { useAtom, useSetAtom } from 'jotai'
import { useResetAtom } from 'jotai/utils'
import { useSnackbar } from 'notistack'
import { useCallback, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { APIError } from '../../../api/http'
import { errorSnackbarOptions } from '../../../lib/client/snackbar'
import { getChanges, isEmptyObject, isObject } from '../../../lib/utils'
import { adminEditableEventByIdAtom, adminNewEventAtom, adminSaveEventAtom } from '../state'

type EventFormOptions = {
  eventId?: string
  storedEvent?: DogEvent | null
  onDoneRedirect?: string
  /**
   * Replaces the default notice, which reports the event's own state ("published", "saved as draft").
   * A page that edits one part of an event should say what it saved instead.
   */
  savedMessage?: string
}

/**
 * A hook that handles common event form operations for both create and edit scenarios
 */
export default function useEventForm(options: EventFormOptions = {}) {
  const { eventId, storedEvent = null, onDoneRedirect, savedMessage } = options

  const [event, setEvent] = useAtom(eventId ? adminEditableEventByIdAtom(eventId) : adminNewEventAtom)
  const resetEvent = useResetAtom(eventId ? adminEditableEventByIdAtom(eventId) : adminNewEventAtom)
  const initialEvent = useRef(event)

  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()
  const saveEvent = useSetAtom(adminSaveEventAtom)

  const createMode = !storedEvent
  const [changes, setChanges] = useState<Patch<DogEvent>>(getChanges(storedEvent ?? initialEvent.current, event))
  const [canSave, setCanSave] = useState<boolean>(createMode || !isEmptyObject(changes))

  /**
   * Despite the `Patch` type, this replaces the stored event outright — a caller handing it a real
   * patch wipes every field the patch does not mention, the id included, and the form then reports the
   * event as missing. Callers must merge into the current event first, as EventForm does.
   */
  const handleChange = useCallback(
    (newState: Patch<DogEvent>) => {
      const newChanges = getChanges(storedEvent ?? initialEvent.current, newState as DogEvent)
      setChanges(newChanges)
      setCanSave(!storedEvent || !isEmptyObject(newChanges))

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
      const saved = await saveEvent({
        event,
        formChanges: storedEvent ? { ...changes, modifiedAt: initialEvent.current.modifiedAt } : undefined,
      })
      if (saved) {
        initialEvent.current = saved
        setChanges({})
        setCanSave(false)
      }
      resetEvent()
      if (onDoneRedirect) {
        navigate(onDoneRedirect)
      }
      enqueueSnackbar(
        savedMessage ?? t(`event.states.${saved?.state ?? 'draft'}`, { context: 'save', defaultValue: '' }),
        {
          variant: 'info',
        }
      )
    } catch (error) {
      if (error instanceof APIError && error.status === 409 && isObject(error.body)) {
        if (error.body.error === 'staleData') {
          enqueueSnackbar(t('event.staleData'), errorSnackbarOptions)
          return
        }
        if (error.body.error === 'kcIdConflict') {
          enqueueSnackbar(t('event.kcIdConflict'), errorSnackbarOptions)
          return
        }
      }
      console.error(error)
    }
  }, [changes, enqueueSnackbar, event, navigate, onDoneRedirect, resetEvent, saveEvent, savedMessage, storedEvent, t])

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
