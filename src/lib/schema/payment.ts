import { integer, minValue, nonEmpty, object, optional, pipe } from 'valibot'
import { num, str } from './common'

const required = pipe(str, nonEmpty('is required'))

const cents = (minimum: number) =>
  pipe(num, integer('must be a whole number of cents'), minValue(minimum, `must be at least ${minimum}`))

/**
 * Starting a payment names exactly one registration, and nothing else in the body is used. Both ids
 * are required and must carry a value: a missing or empty id used to reach the registration lookup and
 * surface as a 500 rather than as the bad request it is.
 */
export const paymentCreateSchema = object({
  eventId: required,
  registrationId: required,
})

/**
 * A refund names the payment it comes from and the amounts in whole cents: what goes back, at least a
 * cent, and the handling fee kept from it, none when left out. Whether the payment holds that much is
 * `getRefundableAmount`, which needs the transactions (KOE-1614).
 */
export const refundCreateSchema = object({
  amount: cents(1),
  handlingCost: optional(cents(0), 0),
  transactionId: required,
})
