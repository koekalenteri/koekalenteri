import type { ResultTasksDroppedBody } from '@/lib/resultTasks'
import type { DogEvent, Patch } from '@/types'
import type { DroppedTasksDialogProps } from '../components/DroppedTasksDialog'
import type { EventDraftForm } from '../state'
import { useAtom, useSetAtom } from 'jotai'
import { useResetAtom } from 'jotai/utils'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { APIError } from '@/api/http'
import { errorSnackbarOptions } from '@/lib/client/snackbar'
import { getEventSavedMessage } from '@/lib/event'
import { isResultTasksDroppedBody } from '@/lib/resultTasks'
import { getChanges, isEmptyObject, isObject } from '@/lib/utils'
import { adminEditableEventByIdAndFormAtom, adminNewEventAtom, adminSaveEventAtom, isStaleEventDraft } from '../state'

/**
 * A stored event is edited on the draft of the view that edits it, so a change left on one view does not
 * turn up in another (KOE-1700). A new event has one draft.
 */
type EventDraftOptions = { eventId: string; form: EventDraftForm } | { eventId?: undefined; form?: undefined }

type EventFormOptions = EventDraftOptions & {
  storedEvent?: DogEvent | null
  onDoneRedirect?: string
  /**
   * Replaces the default notice, which reports the event's own state ("published", "saved as draft").
   * A page that edits one part of an event should say what it saved instead.
   */
  savedMessage?: string
  /** Called once a save has gone through, after the notice: a dialog closes itself here rather than on a refusal. */
  onSaved?: () => void
}

type RefusalKey =
  | 'event.saveForbidden'
  | 'event.staleData'
  | 'event.kcIdConflict'
  | 'event.kcGuidConflict'
  | 'event.kcGuidLocked'
  | 'event.officialFormatClassShape'
  | 'event.officialFormatLocked'
  | 'event.paymentLocked'
  | 'event.resultsLocked'

/** The 409s the server names, by the error it names them with. */
const CONFLICT_NOTICES: Partial<Record<string, RefusalKey>> = {
  kcGuidConflict: 'event.kcGuidConflict',
  kcGuidLocked: 'event.kcGuidLocked',
  kcIdConflict: 'event.kcIdConflict',
  officialFormatClassShape: 'event.officialFormatClassShape',
  officialFormatLocked: 'event.officialFormatLocked',
  paymentLocked: 'event.paymentLocked',
  staleData: 'event.staleData',
}

/**
 * The notice for a refusal the secretary can act on: no right to this event, or a 409 the server
 * named. Anything else is unexpected and gets the general notice, with the error logged.
 */
const knownRefusal = (error: unknown): RefusalKey | undefined => {
  if (!(error instanceof APIError)) return undefined
  if (error.status === 403) return 'event.saveForbidden'
  if (error.status === 423 && isObject(error.body) && error.body.error === 'resultsLocked') return 'event.resultsLocked'
  if (error.status === 409 && isObject(error.body) && typeof error.body.error === 'string') {
    return CONFLICT_NOTICES[error.body.error]
  }
  return undefined
}

/**
 * What the secretary is told of a refused save. A refusal the server did not name is unexpected, so it is
 * logged as well as reported.
 */
const refusalNotice = (error: unknown): RefusalKey | 'event.saveFailed' => {
  const known = knownRefusal(error)
  if (!known) console.error(error)
  return known ?? 'event.saveFailed'
}

/**
 * The classes a refused save would have taken from under their registrations (KOE-674): PutEvent reads
 * every registration, cancelled and unpaid ones too, which the form cannot all see. None for any other
 * refusal.
 */
const enteredClassesRefused = (error: unknown): string[] | undefined => {
  if (!(error instanceof APIError) || error.status !== 400 || !isObject(error.body)) return undefined
  const { error: kind, errors } = error.body
  if (kind !== 'invalidOwnClasses' || !Array.isArray(errors)) return undefined
  const codes = errors.flatMap((item: unknown) =>
    isObject(item) && item.kind === 'registered' && typeof item.code === 'string' ? [item.code] : []
  )
  return codes.length ? codes : undefined
}

/** The question a save answered with when the change would drop recorded scores (KOE-1666). */
const droppedTasksOf = (error: unknown): ResultTasksDroppedBody | undefined =>
  error instanceof APIError && error.status === 409 && isResultTasksDroppedBody(error.body) ? error.body : undefined

/**
 * A hook that handles common event form operations for both create and edit scenarios
 */
export default function useEventForm(options: EventFormOptions = {}) {
  const { eventId, form, storedEvent = null, onDoneRedirect, onSaved, savedMessage } = options

  const draftAtom = eventId ? adminEditableEventByIdAndFormAtom({ eventId, form }) : adminNewEventAtom
  const [draft, setEvent] = useAtom(draftAtom)
  const resetEvent = useResetAtom(draftAtom)
  // Decided once, as the view opens: a draft begun before the event was last saved is dropped, but a
  // change made while the view is open stays, whoever saves the event meanwhile (KOE-1700).
  const [staleDraft, setStaleDraft] = useState(() => !!eventId && isStaleEventDraft(draft, storedEvent, eventId))
  // Until the effect has dropped it, the stale draft is not shown: the view opens on the event as stored.
  const event = (staleDraft ? storedEvent : null) ?? draft
  useEffect(() => {
    if (!staleDraft) return
    resetEvent()
    setStaleDraft(false)
  }, [resetEvent, staleDraft])
  const initialEvent = useRef(event)

  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const navigate = useNavigate()
  const saveEvent = useSetAtom(adminSaveEventAtom)

  const createMode = !storedEvent
  const [changes, setChanges] = useState<Patch<DogEvent>>(getChanges(storedEvent ?? initialEvent.current, event))
  const [canSave, setCanSave] = useState<boolean>(createMode || !isEmptyObject(changes))
  const [droppedTasks, setDroppedTasks] = useState<ResultTasksDroppedBody>()

  /**
   * Goes on to the redirect once the form has nothing left to save. The router asks a page's
   * `useUnsavedChangesWarning` at the moment of `navigate`, so the page must have rendered with that
   * by then: a state update still waiting for its render would have it ask about a finished form.
   */
  const leave = useCallback(() => {
    if (!onDoneRedirect) return
    flushSync(() => setCanSave(false))
    void navigate(onDoneRedirect)
  }, [navigate, onDoneRedirect])

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

  const save = useCallback(
    async (confirmDrops?: string) => {
      if (!event) {
        return
      }

      try {
        const saved = await saveEvent({
          confirmDrops,
          event,
          formChanges: storedEvent ? { ...changes, modifiedAt: initialEvent.current.modifiedAt } : undefined,
        })
        if (saved) {
          initialEvent.current = saved
          setChanges({})
          setCanSave(false)
        }
        resetEvent()
        leave()
        enqueueSnackbar(savedMessage ?? getEventSavedMessage(saved?.state, t), { variant: 'info' })
        onSaved?.()
      } catch (error) {
        // A change that would drop recorded scores is asked about first; the form stays as edited meanwhile.
        const dropped = droppedTasksOf(error)
        if (dropped) {
          setDroppedTasks(dropped)
          return
        }
        const entered = enteredClassesRefused(error)
        if (entered) {
          enqueueSnackbar(t('event.ownClasses.refused', { list: entered.join(', ') }), errorSnackbarOptions)
          return
        }
        // A refused save must not pass in silence: the form stays as it was, and the secretary would
        // take the quiet for a success (KOE-1482).
        enqueueSnackbar(t(refusalNotice(error)), errorSnackbarOptions)
      }
    },
    [changes, enqueueSnackbar, event, leave, onSaved, resetEvent, saveEvent, savedMessage, storedEvent, t]
  )

  const handleSave = useCallback(() => save(), [save])

  // Confirming sends back what the save answered with, so the drops confirmed are the ones shown; a set
  // that changed meanwhile is asked about again.
  const dropsDialogProps: DroppedTasksDialogProps = {
    dogs: droppedTasks?.dogs ?? [],
    onCancel: () => setDroppedTasks(undefined),
    onConfirm: async () => {
      const confirmation = droppedTasks?.confirmation
      setDroppedTasks(undefined)
      await save(confirmation)
    },
    open: droppedTasks !== undefined,
  }

  const handleCancel = useCallback(() => {
    resetEvent()
    leave()
  }, [leave, resetEvent])

  return {
    canSave,
    changes,
    /** Drops this view's draft, and only that, and stays put, for a page whose leaving is decided elsewhere. */
    discardChanges: resetEvent,
    dropsDialogProps,
    event,
    handleCancel,
    handleChange,
    handleSave,
  }
}
