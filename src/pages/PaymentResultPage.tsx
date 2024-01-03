import type { LoaderFunctionArgs } from 'react-router-dom'

import { redirect } from 'react-router-dom'

import { verifyPayment } from '../api/payment'
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

  const response = await verifyPayment(params)

  if (response?.eventId && response.registrationId) {
    if (response.status === 'ok') {
      return redirect(Path.registrationOk({ eventId: response.eventId, id: response.registrationId }))
    }
    return redirect(Path.payment({ eventId: response.eventId, id: response.registrationId }))
  }
  return redirect(Path.home)
}
