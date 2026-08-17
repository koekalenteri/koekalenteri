import type { LoaderFunctionArgs } from 'react-router'
import { t } from 'i18next'
import { enqueueSnackbar } from 'notistack'
import { redirect } from 'react-router'
import { verifyPayment } from '../api/payment'
import { reportError } from '../lib/client/error'
import { Path } from '../routeConfig'

export const paymentResultLoader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url)
  const returnEditToken = url.searchParams.get('editToken') ?? undefined
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
      const editToken = response.editToken ?? returnEditToken
      const registration = {
        eventId: response.eventId,
        id: response.registrationId,
        ...(editToken ? { editToken } : {}),
      }
      if (response.status === 'ok') {
        return redirect(`${Path.registrationOk(registration)}?payment=verifying`)
      }
      if (response.paymentStatus === 'fail') {
        enqueueSnackbar(t('registration.notifications.paymentFailed'), { variant: 'info' })
      }
      return redirect(Path.payment(registration))
    }
  } catch (e) {
    reportError(e)
  }
  return redirect(Path.home)
}
