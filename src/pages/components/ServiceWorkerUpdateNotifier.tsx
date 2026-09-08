import type { SnackbarKey } from 'notistack'
import Button from '@mui/material/Button'
import { lightFormat } from 'date-fns'
import { useSnackbar } from 'notistack'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { appBuildTime } from '../../lib/client/build'
import { Path } from '../../routeConfig'
import {
  activateServiceWorkerUpdate,
  consumeServiceWorkerUpdated,
  subscribeToServiceWorkerUpdates,
} from '../../serviceWorkerRegistration'
import SnackbarCloseButton from './SnackbarCloseButton'

interface WhatsNewActionProps {
  readonly snackbarKey: SnackbarKey
  readonly version: string
}

/**
 * The way from the update notice to the release's notes. The notifier sits outside the router, so
 * this is a plain link; the page has just reloaded for the update anyway, so one more full
 * navigation costs nothing (KOE-1398).
 */
const WhatsNewAction = ({ snackbarKey, version }: WhatsNewActionProps) => {
  const { t } = useTranslation()

  return (
    <>
      <Button color="inherit" size="small" href={`${Path.whatsNew}#${version}`}>
        {t('app.whatsNew')}
      </Button>
      <SnackbarCloseButton snackbarKey={snackbarKey} />
    </>
  )
}

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
      if (versionChange.from === versionChange.to) {
        enqueueSnackbar(
          t('app.updatedBuild', {
            date: lightFormat(appBuildTime, 'dd.MM.yyyy'),
            time: lightFormat(appBuildTime, 'HH:mm'),
            to: versionChange.to,
          }),
          { variant: 'success' }
        )
      } else {
        enqueueSnackbar(t('app.updated', versionChange), {
          action: (key) => <WhatsNewAction snackbarKey={key} version={versionChange.to} />,
          variant: 'success',
        })
      }
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
