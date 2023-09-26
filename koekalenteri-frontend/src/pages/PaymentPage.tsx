import type { Params } from 'react-router-dom'

import { createPayment } from '../api/payment'

export const paymentLoader = async ({ params }: { params: Params<string> }) =>
  params.id ? createPayment(params.id) : []
