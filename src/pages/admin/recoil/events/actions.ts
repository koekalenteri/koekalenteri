import type { DogEvent } from '../../../../types'

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { diff } from 'deep-object-diff'
import { useSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil'

import { copyEventWithRegistrations, putEvent } from '../../../../api/event'
import { copyDogEvent, sanitizeDogEvent } from '../../../../lib/event'
import { Path } from '../../../../routeConfig'
import { eventsAtom, idTokenAtom, userSelector } from '../../../recoil'

import { adminEventIdAtom, adminNewEventAtom } from './atoms'
import { adminCurrentEventSelector } from './selectors'

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
    save,
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

  async function save(event: Partial<DogEvent>): Promise<DogEvent | undefined> {
    let changes: Partial<DogEvent> = event
    if (event.id && event.id === currentAdminEvent?.id) {
      const changedKeys = Object.keys(diff(currentAdminEvent, event))
      changes = { id: event.id }
      for (const key of changedKeys) {
        //@ts-expect-error typescript is just so stupid sometimes
        changes[key] = event[key]
      }
    }
    console.log(changes)
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
}
