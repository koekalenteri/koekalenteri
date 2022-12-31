import { useTranslation } from "react-i18next"
import { useAuthenticator } from "@aws-amplify/ui-react"
import cloneDeep from "lodash.clonedeep"
import { useSnackbar } from "notistack"
import { useRecoilState, useSetRecoilState } from "recoil"

import { adminEventIdAtom } from "./atoms"
import { currentAdminEventQuery } from "./selectors"


export const useAdminEventActions = () => {
  const { user } = useAuthenticator(context => [context.user])
  const setAdminEventId = useSetRecoilState(adminEventIdAtom)
  const [currentAdminEvent, setCurrentAdminEvent] = useRecoilState(currentAdminEventQuery)
  const { enqueueSnackbar } = useSnackbar()
  const { t } = useTranslation()

  return {
    copyCurrent,
    deleteCurrent,
  }

  function copyCurrent() {
    if (!currentAdminEvent) {
      return
    }
    const copy = cloneDeep(currentAdminEvent)
    copy.id = 'draft'
    copy.state = 'draft'
    delete copy.kcId

    setCurrentAdminEvent(copy)
    setAdminEventId(copy.id)
    return copy.id
  }

  function deleteCurrent() {
    if (!currentAdminEvent) {
      return
    }
    setCurrentAdminEvent({
      ...currentAdminEvent,
      deletedAt: new Date(),
      deletedBy: user.attributes?.name || user.attributes?.email,
    })
    enqueueSnackbar(t('deleteEventComplete'), { variant: 'info' })
  }

}
