import { nonEmpty, object, pipe } from 'valibot'
import { str } from './common'

const required = pipe(str, nonEmpty('is required'))

/**
 * Starting a payment names exactly one registration, and nothing else in the body is used. Both ids
 * are required and must carry a value: a missing or empty id used to reach the registration lookup and
 * surface as a 500 rather than as the bad request it is.
 */
export const paymentCreateSchema = object({
  eventId: required,
  registrationId: required,
})
