import { union, unknown } from 'valibot'
import { arrayOf, bool, maybe, num, objectOf, oneOf, str } from './common'

/**
 * The shape of a registration body on the wire.
 *
 * Every field is optional, because one endpoint takes a new registration, an edit of an existing one
 * and a PATCH, and only the handler knows which of them a given body is; the completeness checks stay
 * where that context is. What the schema settles is the part the handler cannot recover from — a field
 * that is present but of the wrong type, which used to reach DynamoDB or blow up as a 500.
 */
const person = {
  email: maybe(str),
  location: maybe(str),
  membership: maybe(bool),
  name: maybe(str),
  phone: maybe(str),
}

const registrationDate = objectOf({
  date: maybe(str),
  time: maybe(oneOf(['ap', 'ip', 'kp'])),
})

const testResult = objectOf({
  class: maybe(str),
  date: maybe(str),
  result: maybe(str),
  type: maybe(str),
})

const dog = objectOf({
  breedCode: maybe(str),
  dob: maybe(str),
  gender: maybe(oneOf(['F', 'M'])),
  kcId: maybe(num),
  name: maybe(str),
  regNo: maybe(str),
  results: maybe(arrayOf(testResult)),
  titles: maybe(str),
})

/** `true` is the legacy single-owner record; a string picks an owner out of `owners` by its key. */
const ownerSelector = union([bool, str], 'must be a boolean or a string')

export const registrationBodySchema = objectOf({
  agreeToTerms: maybe(bool),
  breeder: maybe(objectOf({ name: maybe(str) })),
  cancelled: maybe(bool),
  cancelReason: maybe(str),
  class: maybe(oneOf(['ALO', 'AVO', 'VOI'])),
  confirmed: maybe(bool),
  creationIdempotencyKey: maybe(str),
  dates: maybe(arrayOf(registrationDate)),
  dog: maybe(dog),
  editTokenVersion: maybe(num),
  eventId: maybe(str),
  eventType: maybe(str),
  handler: maybe(objectOf(person)),
  id: maybe(str),
  internalNotes: maybe(str),
  invitationRead: maybe(bool),
  language: maybe(oneOf(['fi', 'en'])),
  notes: maybe(str),
  optionalCosts: maybe(arrayOf(num)),
  owner: maybe(objectOf(person)),
  ownerHandles: maybe(ownerSelector),
  ownerPays: maybe(ownerSelector),
  owners: maybe(arrayOf(objectOf({ ...person, key: maybe(str) }))),
  payer: maybe(objectOf(person)),
  priorityByInvitation: maybe(bool),
  qualifyingResults: maybe(arrayOf(unknown())),
  reserve: maybe(oneOf(['ANY', 'DAY', 'WEEK', 'NO', ''])),
  results: maybe(arrayOf(testResult)),
})
