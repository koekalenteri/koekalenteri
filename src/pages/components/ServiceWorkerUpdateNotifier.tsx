import { lightFormat } from 'date-fns'
import { useSnackbar } from 'notistack'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { appBuildTime } from '../../lib/client/build'
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
      // The update reloaded the page, so this bundle is the update itself and
      // its own build time is the one to report.
      const message =
        versionChange.from === versionChange.to
          ? t('app.updatedBuild', {
              date: lightFormat(appBuildTime, 'dd.MM.yyyy'),
              time: lightFormat(appBuildTime, 'HH:mm'),
              to: versionChange.to,
            })
          : t('app.updated', versionChange)
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
