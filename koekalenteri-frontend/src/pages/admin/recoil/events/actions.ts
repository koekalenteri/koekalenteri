import type { Event } from 'koekalenteri-shared/model'

import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuthenticator } from '@aws-amplify/ui-react'
import { addDays, differenceInDays } from 'date-fns'
import { useSnackbar } from 'notistack'
import { useRecoilState, useSetRecoilState } from 'recoil'

import { copyEventWithRegistrations, putEvent } from '../../../../api/event'
import { Path } from '../../../../routeConfig'

import {
  adminEventIdAtom,
  newEventAtom,
  newEventEntryEndDate,
  newEventEntryStartDate,
  newEventStartDate,
} from './atoms'
import { currentAdminEventSelector } from './selectors'

export const useAdminEventActions = () => {
  const { user } = useAuthenticator((context) => [context.user])
  const setAdminEventId = useSetRecoilState(adminEventIdAtom)
  const [currentAdminEvent, setCurrentAdminEvent] = useRecoilState(currentAdminEventSelector)
  const setNewEvent = useSetRecoilState(newEventAtom)
  const { enqueueSnackbar } = useSnackbar()
  const { t } = useTranslation()
  const navigate = useNavigate()

  return {
    copyCurrent,
    copyCurrentTest,
    deleteCurrent,
    save,
  }

  function copyCurrent() {
    if (!currentAdminEvent) {
      return
    }
    const copy = structuredClone(currentAdminEvent)
    copy.id = ''
    copy.name = 'Kopio - ' + (copy.name ?? '')
    copy.state = 'draft'
    copy.entries = 0
    copy.classes.forEach((c) => {
      c.entries = c.members = 0
      if (c.date) {
        c.date = addDays(newEventStartDate, differenceInDays(copy.startDate, c.date))
      }
      delete c.state
    })

    const days = differenceInDays(copy.endDate, copy.startDate)
    copy.startDate = newEventStartDate
    copy.endDate = addDays(newEventStartDate, days)
    copy.entryStartDate = newEventEntryStartDate
    copy.entryEndDate = newEventEntryEndDate

    delete copy.kcId
    delete copy.entryOrigEndDate

    setNewEvent(copy)
    navigate(Path.admin.newEvent)
  }

  async function copyCurrentTest() {
    if (!currentAdminEvent) {
      return
    }
    const saved = await copyEventWithRegistrations(
      currentAdminEvent.id,
      user.getSignInUserSession()?.getIdToken().getJwtToken()
    )
    setAdminEventId(saved.id)
    setCurrentAdminEvent(saved)
    return saved
  }

  async function save(event: Partial<Event>): Promise<Event> {
    const saved = await putEvent(event, user.getSignInUserSession()?.getIdToken().getJwtToken())
    setAdminEventId(saved.id)
    setCurrentAdminEvent(saved)
    return saved
  }

  async function deleteCurrent() {
    if (!currentAdminEvent || currentAdminEvent.deletedAt) {
      return
    }

    await save({
      ...currentAdminEvent,
      deletedAt: new Date(),
      deletedBy: user.attributes?.name ?? user.attributes?.email,
    })

    enqueueSnackbar(t('deleteEventComplete'), { variant: 'info' })
  }
}
