import type { DogEvent, Patch, RegistrationClass } from '../../../../types'
import { diff } from 'deep-object-diff'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'
import { copyEventWithRegistrations, putEvent } from '../../../../api/event'
import {
  copyDogEvent,
  getStartListPublishedClassMap,
  isStartListPublishedForClass,
  sanitizeDogEvent,
} from '../../../../lib/event'
import { Path } from '../../../../routeConfig'
import { eventsAtom, idTokenAtom, userSelector } from '../../../recoil'
import { adminEventIdAtom, adminNewEventAtom } from './atoms'
import { adminCurrentEventSelector } from './selectors'

export const buildEventSavePatch = (event: Patch<DogEvent>, currentAdminEvent?: DogEvent | null): Patch<DogEvent> => {
  if (!event.id || event.id !== currentAdminEvent?.id) {
    return event
  }

  const changedKeys = Object.keys(diff(currentAdminEvent, event))
  const changes: Patch<DogEvent> = { id: event.id }
  for (const key of changedKeys) {
    const value = (event as Record<string, unknown>)[key]
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

export const buildStartListPublishedPatch = (
  event: DogEvent,
  published: boolean
): Patch<DogEvent> & { id: string } => ({
  id: event.id,
  startListPublished: published,
})

export const useAdminEventActions = () => {
  const token = useRecoilValue(idTokenAtom)
  const user = useRecoilValue(userSelector)
  const setAdminEventId = useSetRecoilState(adminEventIdAtom)
  const [currentAdminEvent, setCurrentAdminEvent] = useRecoilState(adminCurrentEventSelector)
  const setNewEvent = useSetRecoilState(adminNewEventAtom)
  const [publicEvents, setPublicEvents] = useRecoilState(eventsAtom)
  const { enqueueSnackbar } = useSnackbar()
  const { t } = useTranslation()
  const navigate = useNavigate()

  return {
    copyCurrent,
    copyCurrentTest,
    deleteCurrent,
    publishStartListClass,
    save,
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

  async function save(event: Patch<DogEvent>): Promise<DogEvent | undefined> {
    const changes = buildEventSavePatch(event, currentAdminEvent)
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

  async function publishStartListClass(event: DogEvent, eventClass: RegistrationClass): Promise<DogEvent | undefined> {
    return setStartListClassPublished(event, eventClass, true)
  }
}
