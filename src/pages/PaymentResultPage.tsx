import type { LoaderFunctionArgs } from 'react-router-dom'

import { redirect } from 'react-router-dom'
import { t } from 'i18next'
import { enqueueSnackbar } from 'notistack'

import { verifyPayment } from '../api/payment'
import { reportError } from '../lib/client/error'
import { Path } from '../routeConfig'

export const paymentResultLoader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)
  const keys = Array.from(url.searchParams.keys())
    .filter((key) => key.startsWith('checkout-'))
    .concat('signature')
  const params = keys.reduce<Record<string, string>>((acc, key) => {
    const value = url.searchParams.get(key)
    if (value) acc[key] = value
    return acc
  }, {})

  try {
    const response = await verifyPayment(params)

    if (response?.eventId && response.registrationId) {
      if (response.status === 'ok') {
        return redirect(Path.registrationOk({ eventId: response.eventId, id: response.registrationId }))
      }
      if (response.paymentStatus === 'fail') {
        enqueueSnackbar(t('registration.notifications.paymentFailed'), { variant: 'info' })
      }
      return redirect(Path.payment({ eventId: response.eventId, id: response.registrationId }))
    }
  } catch (e) {
    reportError(e)
  }
  return redirect(Path.home)
}
