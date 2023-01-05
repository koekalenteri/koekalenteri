import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import { useAuthenticator } from "@aws-amplify/ui-react"
import { Event } from "koekalenteri-shared/model"
import cloneDeep from "lodash.clonedeep"
import { useSnackbar } from "notistack"
import { useRecoilState, useSetRecoilState } from "recoil"

import { putEvent } from "../../../../api/event"
import { Path } from "../../../../routeConfig"

import { adminEventIdAtom, newEventAtom } from "./atoms"
import { DecoratedEvent, decorateEvent } from "./effects"
import { currentAdminEventSelector } from "./selectors"


export const useAdminEventActions = () => {
  const { user } = useAuthenticator(context => [context.user])
  const setAdminEventId = useSetRecoilState(adminEventIdAtom)
  const [currentAdminEvent, setCurrentAdminEvent] = useRecoilState(currentAdminEventSelector)
  const setNewEvent = useSetRecoilState(newEventAtom)
  const { enqueueSnackbar } = useSnackbar()
  const { t } = useTranslation()
  const navigate = useNavigate()

  return {
    copyCurrent,
    deleteCurrent,
    save,
  }

  function copyCurrent() {
    if (!currentAdminEvent) {
      return
    }
    const copy = cloneDeep(currentAdminEvent)
    copy.id = ''
    copy.state = 'draft'
    copy.entries = 0
    copy.classes.forEach(c => c.entries = c.members = 0)
    delete copy.kcId

    setNewEvent(copy)
    navigate(Path.admin.newEvent)
  }

  async function save(event: Partial<Event>): Promise<DecoratedEvent> {
    const saved = await putEvent(event, user.getSignInUserSession()?.getIdToken().getJwtToken())
    const decorated = decorateEvent(saved)
    setAdminEventId(decorated.id)
    setCurrentAdminEvent(decorated)
    return decorated
  }

  async function deleteCurrent() {
    if (!currentAdminEvent || currentAdminEvent.deletedAt) {
      return
    }

    await save({
      ...currentAdminEvent,
      deletedAt: new Date(),
      deletedBy: user.attributes?.name || user.attributes?.email,
    })

    enqueueSnackbar(t('deleteEventComplete'), { variant: 'info' })
  }

}
