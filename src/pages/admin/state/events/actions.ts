import type { DogEvent, Patch, RegistrationClass } from '../../../../types'
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { copyEventWithRegistrations, putEvent } from '../../../../api/event'
import { getChangedTopLevelKeys } from '../../../../lib/diff'
import {
  copyDogEvent,
  getResultsPublishedClassMap,
  getStartListPublishedClassMap,
  isResultsPublishedForClass,
  isStartListPublishedForClass,
  sanitizeDogEvent,
} from '../../../../lib/event'
import { Path } from '../../../../routeConfig'
import { eventsAtom, userAtom, validIdTokenAtom } from '../../../state'
import { adminEventIdAtom, adminNewEventAtom } from './atoms'
import { adminCurrentEventAtom } from './derivedAtoms'

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
    const index = publicEvents.findIndex((candidate) => candidate.id === saved.id)
    const publicEvent = sanitizeDogEvent(saved)
    if (index >= 0) {
      const next = [...publicEvents]
      next.splice(index, 1, publicEvent)
      set(eventsAtom, next)
    } else {
      set(eventsAtom, [...publicEvents, publicEvent])
    }
    return saved
  }
)

export const useAdminEventActions = () => {
  const token = useAtomValue(validIdTokenAtom)
  const user = useAtomValue(userAtom)
  const setAdminEventId = useSetAtom(adminEventIdAtom)
  const [currentAdminEvent, setCurrentAdminEvent] = useAtom(adminCurrentEventAtom)
  const setNewEvent = useSetAtom(adminNewEventAtom)
  const [publicEvents, setPublicEvents] = useAtom(eventsAtom)
  const { enqueueSnackbar } = useSnackbar()
  const { t } = useTranslation()
  const navigate = useNavigate()

  return {
    copyCurrent,
    copyCurrentTest,
    deleteCurrent,
    publishStartListClass,
    save,
    setResultsClassPublished,
    setStartListClassPublished,
    setStartListPublished,
  }

  function updatePublicEvents(event: DogEvent, remove?: boolean): void {
    if (event.id) {
      const index = publicEvents.findIndex((e) => e.id === event.id)
      if (index >= 0) {
        const newEvents = [...publicEvents]
        if (remove) {
          newEvents.splice(index, 1)
        } else {
          newEvents.splice(index, 1, sanitizeDogEvent(event))
        }
        setPublicEvents(newEvents)
      } else if (!remove) {
        setPublicEvents([...publicEvents, sanitizeDogEvent(event)])
      }
    }
  }

  function copyCurrent() {
    if (!currentAdminEvent) {
      return
    }

    const copy = copyDogEvent(currentAdminEvent)

    setNewEvent(copy)
    navigate(Path.admin.newEvent)
  }

  async function copyCurrentTest() {
    if (!currentAdminEvent) {
      return
    }
    const saved = await copyEventWithRegistrations(currentAdminEvent.id, token)
    setAdminEventId(saved.id)
    setCurrentAdminEvent(saved)
    updatePublicEvents(saved)
    return saved
  }

  async function save(event: Patch<DogEvent>, formChanges?: Patch<DogEvent>): Promise<DogEvent | undefined> {
    const changes = buildEventSavePatch(event, currentAdminEvent, formChanges)
    const saved = await putEvent(changes, token)
    setAdminEventId(saved.id)
    setCurrentAdminEvent(saved)
    updatePublicEvents(saved)

    return saved
  }

  async function deleteCurrent() {
    if (!currentAdminEvent || currentAdminEvent.deletedAt) {
      return
    }

    await save({
      ...currentAdminEvent,
      deletedAt: new Date(),
      deletedBy: user?.name ?? user?.email,
    })

    updatePublicEvents(currentAdminEvent, true)

    enqueueSnackbar(t('deleteEventComplete'), { variant: 'info' })
  }

  async function setStartListClassPublished(
    event: DogEvent,
    eventClass: RegistrationClass,
    published: boolean
  ): Promise<DogEvent | undefined> {
    if (!event?.id) return
    if (isStartListPublishedForClass(event, eventClass) === published) return event

    const saved = await putEvent(buildStartListClassPublishedPatch(event, eventClass, published), token)
    setAdminEventId(saved.id)
    setCurrentAdminEvent(saved)
    updatePublicEvents(saved)

    return saved
  }

  async function setStartListPublished(event: DogEvent, published: boolean): Promise<DogEvent | undefined> {
    if (!event?.id) return
    if ((event.startListPublished !== false) === published) return event

    const saved = await putEvent(buildStartListPublishedPatch(event, published), token)
    setAdminEventId(saved.id)
    setCurrentAdminEvent(saved)
    updatePublicEvents(saved)

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
    setAdminEventId(saved.id)
    setCurrentAdminEvent(saved)
    updatePublicEvents(saved)

    return saved
  }

  async function publishStartListClass(event: DogEvent, eventClass: RegistrationClass): Promise<DogEvent | undefined> {
    return setStartListClassPublished(event, eventClass, true)
  }
}
