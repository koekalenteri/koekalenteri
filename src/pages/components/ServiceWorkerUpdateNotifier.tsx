import { lightFormat } from 'date-fns'
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
      // In development the version number rarely changes, so the build time is
      // the only thing that tells the reloaded build apart from the old one.
      const buildTime = versionChange.from === versionChange.to ? versionChange.buildTime : undefined
      const message =
        buildTime === undefined
          ? t('app.updated', versionChange)
          : t('app.updatedBuild', {
              date: lightFormat(buildTime, 'dd.MM.yyyy'),
              time: lightFormat(buildTime, 'HH:mm'),
              to: versionChange.to,
            })
      enqueueSnackbar(message, { variant: 'success' })
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
