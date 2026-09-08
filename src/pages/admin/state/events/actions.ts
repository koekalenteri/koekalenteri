import type { StartNumbersRequest } from '../../../../api/event'
import type { DogEvent, Patch, RegistrationClass, StationTurnOp } from '../../../../types'
import { atom, useAtomValue, useSetAtom } from 'jotai'
import { useAtomCallback } from 'jotai/utils'
import { enqueueSnackbar } from 'notistack'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { copyEventWithRegistrations, putEvent, putInvitationAttachment, putStartNumbers } from '../../../../api/event'
import { putStationTurn } from '../../../../api/station'
import { getChangedTopLevelKeys } from '../../../../lib/diff'
import {
  compareEventsByDate,
  copyDogEvent,
  getResultsPublishedClassMap,
  getStartListPublishedClassMap,
  isResultsPublishedForClass,
  isStartListPublishedForClass,
  sanitizeDogEvent,
} from '../../../../lib/event'
import { eventsAtom, userAtom, validIdTokenAtom } from '../../../state'
import { adminEventIdAtom, adminEventsAtom, adminNewEventAtom } from './atoms'
import { adminCurrentEventAtom, adminEventAtom } from './derivedAtoms'

export const buildEventSavePatch = (
  event: Patch<DogEvent>,
  currentAdminEvent?: DogEvent | null,
  formChanges?: Patch<DogEvent>
): Patch<DogEvent> => {
  if (!event.id || event.id !== currentAdminEvent?.id) {
    return event
  }

  const changedKeys = formChanges ? Object.keys(formChanges) : getChangedTopLevelKeys(currentAdminEvent, event)
  const changes: Patch<DogEvent> = { id: event.id }
  for (const key of changedKeys) {
    const value =
      key === 'modifiedAt' && formChanges
        ? (formChanges as Record<string, unknown>)[key]
        : (event as Record<string, unknown>)[key]
    ;(changes as Record<string, unknown>)[key] = value === undefined ? null : value
  }
  return changes
}

export const buildStartListClassPublishedPatch = (
  event: DogEvent,
  eventClass: RegistrationClass,
  published: boolean
): Patch<DogEvent> & { id: string } => ({
  id: event.id,
  startListPublished: {
    ...getStartListPublishedClassMap(event),
    [eventClass]: published,
  },
})

const buildResultsClassPublishedPatch = (
  event: DogEvent,
  eventClass: RegistrationClass,
  published: boolean
): Patch<DogEvent> & { id: string } => ({
  id: event.id,
  resultsPublished: {
    ...getResultsPublishedClassMap(event),
    [eventClass]: published,
  },
})

export const buildStartListPublishedPatch = (
  event: DogEvent,
  published: boolean
): Patch<DogEvent> & { id: string } => ({
  id: event.id,
  startListPublished: published,
})

/** Save without subscribing the form controller to asynchronous event collections. */
export const adminSaveEventAtom = atom(
  null,
  async (get, set, { event, formChanges }: { event: Patch<DogEvent>; formChanges?: Patch<DogEvent> }) => {
    const currentAdminEvent = await get(adminCurrentEventAtom)
    const saved = await putEvent(buildEventSavePatch(event, currentAdminEvent, formChanges), get(validIdTokenAtom))

    set(adminEventIdAtom, saved.id)
    await set(adminCurrentEventAtom, saved)

    const publicEvents = get(eventsAtom)
    const publicEvent = sanitizeDogEvent(saved)
    const next = publicEvents.filter((candidate) => candidate.id !== saved.id)
    next.push(publicEvent)
    // A new or redated event lands in calendar order right away, not at the end of the list (KOE-1275).
    next.sort(compareEventsByDate)
    set(eventsAtom, next)
    return saved
  }
)

/**
 * The writes an administrator makes to an event. The hook subscribes to nothing asynchronous: the
 * selected event, the calendar and the user are read when an action runs, so a view can hold the
 * actions without suspending on state it does not itself show (KOE-1343).
 */
export const useAdminEventActions = () => {
  const token = useAtomValue(validIdTokenAtom)
  const setNewEvent = useSetAtom(adminNewEventAtom)
  const { t } = useTranslation()

  const currentEvent = useAtomCallback(useCallback((get) => get(adminCurrentEventAtom), []))

  /** A saved event becomes the selected one, and the public calendar learns of it — or forgets it. */
  const storeSaved = useAtomCallback(
    useCallback(async (get, set, saved: DogEvent, remove?: boolean) => {
      if (!remove) {
        set(adminEventIdAtom, saved.id)
        await set(adminCurrentEventAtom, saved)
      }

      const publicEvents = get(eventsAtom)
      const next = publicEvents.filter((e) => e.id !== saved.id)
      if (remove) {
        if (next.length === publicEvents.length) return
      } else {
        next.push(sanitizeDogEvent(saved))
        // A new or redated event lands in calendar order right away, not at the end of the list (KOE-1275).
        next.sort(compareEventsByDate)
      }
      set(eventsAtom, next)
    }, [])
  )

  // A field written onto an event that is not the current one — a post's turns from its scoring
  // page — lands on that event's own atom, whichever event the secretary has selected.
  const patchStoredEvent = useAtomCallback(
    useCallback(async (get, set, eventId: string, patch: Partial<DogEvent>) => {
      const stored = (await get(adminEventsAtom)).find((event) => event.id === eventId)
      if (stored) set(adminEventAtom(eventId), { ...stored, ...patch })
    }, [])
  )

  const currentUser = useAtomCallback(useCallback((get) => get(userAtom), []))

  return {
    attachInvitation,
    copyCurrent,
    copyCurrentTest,
    deleteCurrent,
    enterStartNumbers,
    publishStartListClass,
    recordStationTurn,
    save,
    setResultsClassPublished,
    setStartListClassPublished,
    setStartListPublished,
    setStartNumbersClassPublished,
    setStartNumbersPublished,
  }

  /**
   * The on-site draw's numbers, entered as a batch (KOE-1218). The server answers with the event
   * the numbers now belong to, and it is stored here rather than left for the socket to deliver,
   * so the screen that entered them shows them without a round trip (KOE-1343).
   */
  async function enterStartNumbers(eventId: string, request: StartNumbersRequest): Promise<DogEvent> {
    const { event: saved } = await putStartNumbers(eventId, request, token)
    await storeSaved(saved)

    return saved
  }

  /** The invitation's PDF, for the whole event or one class; the event learns the new key at once. */
  async function attachInvitation(event: DogEvent, file: File, className?: RegistrationClass) {
    const { invitationAttachmentHistory, key } = await putInvitationAttachment(event.id, file, className, token)
    const attached: DogEvent = className
      ? {
          ...event,
          invitationAttachmentHistory,
          invitationAttachments: { ...event.invitationAttachments, [className]: key },
        }
      : { ...event, invitationAttachment: key, invitationAttachmentHistory }
    await storeSaved(attached)

    return { invitationAttachmentHistory, key }
  }

  /**
   * A post's turn — a dog stepping up, done or set aside — written onto the event's timeline. The
   * answer is the freshest timeline there is and goes straight onto the event; the socket's own
   * copy of the same change arrives later and changes nothing.
   */
  async function recordStationTurn(eventId: string, op: StationTurnOp & { stationId?: string }) {
    const { turns } = await putStationTurn(eventId, op, token ?? '')
    await patchStoredEvent(eventId, { turns })

    return turns
  }

  async function deleteCurrent() {
    const current = await currentEvent()
    if (!current || current.deletedAt) {
      return
    }

    const user = await currentUser()
    await save({
      ...current,
      deletedAt: new Date(),
      deletedBy: user?.name ?? user?.email,
    })
    await storeSaved(current, true)

    enqueueSnackbar(t('deleteEventComplete'), { variant: 'info' })
  }

  /**
   * Prepares a copy of the selected event as the new event; the caller takes the secretary to the
   * form. Navigation stays out of here so the actions need no router, which every view that writes
   * through them would otherwise have to provide.
   */
  async function copyCurrent(): Promise<boolean> {
    const current = await currentEvent()
    if (!current) {
      return false
    }

    setNewEvent(copyDogEvent(current))

    return true
  }

  async function copyCurrentTest() {
    const current = await currentEvent()
    if (!current) {
      return
    }
    const saved = await copyEventWithRegistrations(current.id, token)
    await storeSaved(saved)

    return saved
  }

  async function save(event: Patch<DogEvent>, formChanges?: Patch<DogEvent>): Promise<DogEvent | undefined> {
    const changes = buildEventSavePatch(event, await currentEvent(), formChanges)
    const saved = await putEvent(changes, token)
    await storeSaved(saved)

    return saved
  }

  async function setStartListClassPublished(
    event: DogEvent,
    eventClass: RegistrationClass,
    published: boolean
  ): Promise<DogEvent | undefined> {
    if (!event?.id) return
    if (isStartListPublishedForClass(event, eventClass) === published) return event

    const saved = await putEvent(buildStartListClassPublishedPatch(event, eventClass, published), token)
    await storeSaved(saved)

    return saved
  }

  async function setStartListPublished(event: DogEvent, published: boolean): Promise<DogEvent | undefined> {
    if (!event?.id) return
    if ((event.startListPublished !== false) === published) return event

    const saved = await putEvent(buildStartListPublishedPatch(event, published), token)
    await storeSaved(saved)

    return saved
  }

  async function setStartNumbersClassPublished(
    event: DogEvent,
    eventClass: RegistrationClass,
    published: boolean,
    date?: string
  ): Promise<DogEvent | undefined> {
    if (!event?.id) return

    // Publishing is also the freeze, so it goes through the start-numbers endpoint rather than a
    // plain event patch: the flag flip and the snapshot must land in the same locked request.
    const { event: saved } = await putStartNumbers(event.id, { date, eventClass, published }, token)
    await storeSaved(saved)

    return saved
  }

  async function setStartNumbersPublished(
    event: DogEvent,
    published: boolean,
    date?: string
  ): Promise<DogEvent | undefined> {
    if (!event?.id) return
    if (!date && (event.startNumbersPublished !== false) === published) return event

    const { event: saved } = await putStartNumbers(event.id, { date, published }, token)
    await storeSaved(saved)

    return saved
  }

  async function setResultsClassPublished(
    event: DogEvent,
    eventClass: RegistrationClass,
    published: boolean
  ): Promise<DogEvent | undefined> {
    if (!event?.id) return
    if (isResultsPublishedForClass(event, eventClass) === published) return event

    const saved = await putEvent(buildResultsClassPublishedPatch(event, eventClass, published), token)
    await storeSaved(saved)

    return saved
  }

  async function publishStartListClass(event: DogEvent, eventClass: RegistrationClass): Promise<DogEvent | undefined> {
    return setStartListClassPublished(event, eventClass, true)
  }
}
