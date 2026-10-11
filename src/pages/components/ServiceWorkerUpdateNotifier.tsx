import type { SnackbarKey } from 'notistack'
import type { VersionChange } from '../../serviceWorkerRegistration'
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

const whatsNewAction = (version: string) => (snackbarKey: SnackbarKey) => (
  <WhatsNewAction snackbarKey={snackbarKey} version={version} />
)

/**
 * In development the version number rarely changes, so the build time is the only thing that tells
 * the reloaded build apart from the old one.
 */
const isSameVersion = ({ from, to }: VersionChange) => from === to

interface UpdateNoticeProps {
  readonly versionChange: VersionChange
}

/**
 * The notice's text, translated when it renders rather than when it is enqueued, so it follows any
 * language change while it is on screen. A string translated in the notifier's effect stayed in
 * whatever language i18next had at mount (KOE-1457).
 */
const UpdateNotice = ({ versionChange }: UpdateNoticeProps) => {
  const { t } = useTranslation()

  // The update reloaded the page, so this bundle is the update itself and its own build time is the
  // one to report.
  if (isSameVersion(versionChange)) {
    return t('app.updatedBuild', {
      date: lightFormat(appBuildTime, 'dd.MM.yyyy'),
      time: lightFormat(appBuildTime, 'HH:mm'),
      to: versionChange.to,
    })
  }

  return t('app.updated', versionChange)
}

function ServiceWorkerUpdateNotifier() {
  const { enqueueSnackbar } = useSnackbar()
  const notifiedWorker = useRef<ServiceWorker | undefined>(undefined)

  useEffect(() => {
    const versionChange = consumeServiceWorkerUpdated()
    if (versionChange) {
      // A same-version build has no release notes of its own to link to.
      const action = isSameVersion(versionChange) ? undefined : whatsNewAction(versionChange.to)
      enqueueSnackbar(<UpdateNotice versionChange={versionChange} />, { action, variant: 'success' })
    }

    return subscribeToServiceWorkerUpdates((registration, worker) => {
      if (notifiedWorker.current === worker) return

      notifiedWorker.current = worker
      activateServiceWorkerUpdate(registration, worker)
    })
  }, [enqueueSnackbar])

  return null
}

export default ServiceWorkerUpdateNotifier
