import { useSnackbar } from 'notistack'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  activateServiceWorkerUpdate,
  consumeServiceWorkerUpdated,
  subscribeToServiceWorkerUpdates,
} from '../../serviceWorkerRegistration'

function ServiceWorkerUpdateNotifier() {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const notifiedWorker = useRef<ServiceWorker | undefined>(undefined)

  useEffect(() => {
    const versionChange = consumeServiceWorkerUpdated()
    if (versionChange) {
      enqueueSnackbar(t('app.updated', versionChange), { variant: 'success' })
    }

    return subscribeToServiceWorkerUpdates((registration, worker) => {
      if (notifiedWorker.current === worker) return

      notifiedWorker.current = worker
      activateServiceWorkerUpdate(registration, worker)
    })
  }, [enqueueSnackbar, t])

  return null
}

export default ServiceWorkerUpdateNotifier
