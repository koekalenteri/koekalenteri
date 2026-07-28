import Button from '@mui/material/Button'
import { useSnackbar } from 'notistack'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { activateServiceWorkerUpdate, subscribeToServiceWorkerUpdates } from '../../serviceWorkerRegistration'
import SnackbarCloseButton from './SnackbarCloseButton'

function UpdateAction({
  registration,
  snackbarKey,
}: {
  registration: ServiceWorkerRegistration
  snackbarKey: string | number
}) {
  const { t } = useTranslation()

  return (
    <>
      <Button color="inherit" onClick={() => activateServiceWorkerUpdate(registration)}>
        {t('app.reload')}
      </Button>
      <SnackbarCloseButton snackbarKey={snackbarKey} />
    </>
  )
}

function ServiceWorkerUpdateNotifier() {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const notifiedWorker = useRef<ServiceWorker | undefined>(undefined)

  useEffect(
    () =>
      subscribeToServiceWorkerUpdates((registration, worker) => {
        if (notifiedWorker.current === worker) return

        notifiedWorker.current = worker
        enqueueSnackbar(t('app.updateAvailable'), {
          action: (snackbarKey) => <UpdateAction registration={registration} snackbarKey={snackbarKey} />,
          persist: true,
          variant: 'info',
        })
      }),
    [enqueueSnackbar, t]
  )

  return null
}

export default ServiceWorkerUpdateNotifier
