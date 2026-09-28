import type { JsonDogEvent, JsonRegistration, PublicContactInfo, RegistrationOwner } from '../../types'
import { createHmac, randomBytes } from 'node:crypto'
import { normalizeEmail, withoutPlusTag } from './email'
import { removeRegistrationCreationMetadata } from './registration'

/**
 * A copy of an event with its registrations for another environment (KOE-1467): prod into test or
 * dev, or between test and dev. Every person in it is replaced before the copy leaves the source,
 * and the copy is checked for anything that got through before it is sent anywhere.
 *
 * Replacements are deterministic within one copy — the same original always gets the same stand-in,
 * so logic that compares people (handler = owner, deduplicated recipients) behaves as it did in the
 * source — and keyed with a random secret per copy that is never stored, so a stand-in cannot be
 * traced back by guessing.
 */

/** Who makes the copy: every mail the copy can send goes to this person. */
interface Copier {
  name: string
  email: string
  phone?: string
}

export interface EventCopy {
  event: JsonDogEvent
  registrations: JsonRegistration[]
}

/** What the copy replaced, for checking that none of it survives. Never leaves the source. */
interface CopyOriginals {
  emails: Set<string>
  names: Set<string>
  phones: Set<string>
}

/**
 * Mobile prefix 048 is in Traficom's own number reserve, allocated to no operator (Traficom
 * regulation M 32 V/2025, annex 1). Finland has no range set aside for fiction, and 040 is fully
 * allocated. Check annex 1 again whenever the regulation is renewed.
 */
export const COPY_PHONE_PREFIX = '+358 48 '

/** Stands in for free text, which can name anyone and cannot be rewritten reliably. */
export const COPY_REPLACED_TEXT = '[Kopioinnissa korvattu teksti]'

const COPY_EMAIL_TAG = 'kk-'

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

const FIRST_NAMES = ['Aino', 'Eino', 'Helmi', 'Ilmari', 'Kerttu', 'Lauri', 'Martta', 'Onni', 'Saima', 'Toivo']
const LAST_NAMES = ['Testinen', 'Kokeilu', 'Malli', 'Harjoitus', 'Esimerkki', 'Kopio', 'Näyte', 'Luonnos']

type PersonField = 'pseudonym' | 'email' | 'phone' | 'keep'

/**
 * How each field of a person in a registration is copied. Typed over every key, so a field added
 * to `Person` or `RegistrationOwner` does not compile until someone decides what a copy does with it
 * (and makes `copyPerson` do it; the tests hold the two together).
 */
export const REGISTRATION_PERSON_FIELDS = {
  email: 'email',
  id: 'keep',
  key: 'keep',
  location: 'keep',
  membership: 'keep',
  name: 'pseudonym',
  phone: 'phone',
} as const satisfies Record<keyof RegistrationOwner, PersonField>

const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()

/** The digits that identify a Finnish number whichever way it was written: +358 40…, 040…, 358 40… */
export const phoneDigits = (phone: string) =>
  phone
    .replace(/\D/g, '')
    .replace(/^00358/, '')
    .replace(/^358/, '')
    .replace(/^0/, '')

/**
 * Maps originals to stand-ins, one map per kind. A stand-in is taken from the keyed hash of the
 * original; should two originals land on the same one, the later gets a longer slice of its hash.
 */
const createStandIns = (copier: Copier, key: Buffer) => {
  const copierEmail = withoutPlusTag(copier.email)
  const [copierLocal, copierDomain] = copierEmail.split('@')

  const hash = (kind: string, value: string) => createHmac('sha256', key).update(`${kind}:${value}`).digest()

  const kind = (make: (digest: Buffer, attempt: number) => string) => {
    const byOriginal = new Map<string, string>()
    const taken = new Set<string>()
    return (original: string, digest: Buffer) => {
      const known = byOriginal.get(original)
      if (known) return known
      for (let attempt = 0; ; attempt++) {
        const standIn = make(digest, attempt)
        if (!taken.has(standIn)) {
          taken.add(standIn)
          byOriginal.set(original, standIn)
          return standIn
        }
      }
    }
  }

  const emailStandIn = kind((digest, attempt) => {
    const tag = digest.toString('hex').slice(0, 6 + 2 * attempt)
    return `${copierLocal}+${COPY_EMAIL_TAG}${tag}@${copierDomain}`
  })
  const nameStandIn = kind((digest, attempt) => {
    const first = FIRST_NAMES[digest[0] % FIRST_NAMES.length]
    const last = LAST_NAMES[digest[1] % LAST_NAMES.length]
    return `${first} ${last} ${digest.toString('hex').slice(4, 8 + 2 * attempt)}`
  })
  const phoneStandIn = kind((digest, attempt) => {
    const number = (digest.readUInt32BE(8) + attempt) % 10_000_000
    return `${COPY_PHONE_PREFIX}${String(number).padStart(7, '0')}`
  })

  return {
    email: (original: string) => {
      const email = normalizeEmail(original)
      if (withoutPlusTag(email) === copierEmail) return copierEmail
      return emailStandIn(email, hash('email', email))
    },
    name: (original: string) => nameStandIn(normalize(original), hash('name', normalize(original))),
    phone: (original: string) => phoneStandIn(phoneDigits(original), hash('phone', phoneDigits(original))),
  }
}

type StandIns = ReturnType<typeof createStandIns>

/** Shorter than any real number; a stray digit or two must not make every string a leak. */
const MIN_PHONE_DIGITS = 6

const addPhone = (originals: CopyOriginals, phone: string | undefined) => {
  const digits = phone ? phoneDigits(phone) : ''
  if (digits.length >= MIN_PHONE_DIGITS) originals.phones.add(digits)
}

const collectOriginals = (value: unknown, originals: CopyOriginals, key?: string) => {
  if (typeof value === 'string') {
    for (const match of value.match(EMAIL_RE) ?? []) originals.emails.add(normalizeEmail(match))
    if (key === 'phone') addPhone(originals, value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectOriginals(item, originals)
    return
  }
  if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) collectOriginals(child, originals, childKey)
  }
}

/**
 * Rewrites every address in every string of the copy, whatever the field. Through the JSON text:
 * an address cannot contain a quote or a backslash, so no match reaches across a string's bounds.
 */
const replaceEmails = (copy: EventCopy, standIns: StandIns): EventCopy =>
  JSON.parse(JSON.stringify(copy).replace(EMAIL_RE, (match) => standIns.email(match)))

const copyPerson = <P extends Partial<RegistrationOwner>>(
  person: P | undefined,
  standIns: StandIns,
  originals: CopyOriginals
): P | undefined => {
  if (!person) return person
  if (person.name) originals.names.add(normalize(person.name))
  // email: replaceEmails takes every address in the copy, this field included
  return {
    ...person,
    ...(person.name ? { name: standIns.name(person.name) } : {}),
    ...(person.phone ? { phone: standIns.phone(person.phone) } : {}),
  }
}

const replaceText = (text: string | undefined) => (text?.trim() ? COPY_REPLACED_TEXT : text)

/** Keeps which of name, email and phone the source showed, so the copy's public page shows the same. */
const copierContact = (copier: Copier, standIns: StandIns, original: PublicContactInfo): PublicContactInfo => {
  const phone = copier.phone ?? (original.phone ? standIns.phone(original.phone) : undefined)
  return {
    ...(original.name === undefined ? {} : { name: copier.name }),
    ...(original.email === undefined ? {} : { email: copier.email }),
    ...(original.phone === undefined || phone === undefined ? {} : { phone }),
  }
}

/**
 * What belongs to the source's run of the trial rather than to the event: the live timeline of the
 * day and the short-lived locks. A copy has not run, and nobody holds its locks.
 */
export const removeEventRuntimeState = <T extends Partial<JsonDogEvent>>(event: T): T => {
  delete event.turns
  delete event.registrationGroupsLock
  delete event.registrationPaymentsLock
  return event
}

const copyEvent = (source: JsonDogEvent, copier: Copier, standIns: StandIns, originals: CopyOriginals) => {
  const event: JsonDogEvent = removeEventRuntimeState(structuredClone(source))

  for (const role of ['official', 'secretary'] as const) {
    const person = source[role]
    if (person?.name) originals.names.add(normalize(person.name))
    addPhone(originals, person?.phone)
    event[role] = { email: copier.email, name: copier.name, ...(copier.phone ? { phone: copier.phone } : {}) }
  }
  if (source.contactInfo) {
    for (const role of ['official', 'secretary'] as const) {
      const contact = source.contactInfo[role]
      if (!contact) continue
      if (contact.name) originals.names.add(normalize(contact.name))
      event.contactInfo = { ...event.contactInfo, [role]: copierContact(copier, standIns, contact) }
    }
  }

  event.createdBy = copier.name
  event.modifiedBy = copier.name
  if (event.deletedBy) event.deletedBy = copier.name

  return event
}

const copyRegistration = (source: JsonRegistration, copier: Copier, standIns: StandIns, originals: CopyOriginals) => {
  const registration: JsonRegistration = removeRegistrationCreationMetadata(structuredClone(source))

  registration.owner = copyPerson(registration.owner, standIns, originals)
  registration.handler = copyPerson(registration.handler, standIns, originals)
  registration.payer = copyPerson(registration.payer, standIns, originals)
  registration.owners = registration.owners?.map((owner) => copyPerson(owner, standIns, originals) ?? owner)
  if (registration.breeder?.name) {
    originals.names.add(normalize(registration.breeder.name))
    registration.breeder = { ...registration.breeder, name: standIns.name(registration.breeder.name) }
  }

  registration.notes = replaceText(registration.notes) ?? ''
  registration.internalNotes = replaceText(registration.internalNotes)
  registration.cancelReason = replaceText(registration.cancelReason)
  if (registration.internalNotes === undefined) delete registration.internalNotes
  if (registration.cancelReason === undefined) delete registration.cancelReason

  registration.createdBy = copier.name
  registration.modifiedBy = copier.name
  if (registration.deletedBy) registration.deletedBy = copier.name
  if (registration.eventResult) {
    const { notes, tasks } = registration.eventResult
    registration.eventResult = {
      ...registration.eventResult,
      ...(notes === undefined ? {} : { notes: replaceText(notes) }),
      ...(tasks ? { tasks: tasks.map((task) => ({ ...task, updatedBy: copier.name })) } : {}),
      updatedBy: copier.name,
    }
  }

  // The source's delivery failure concerns an address the copy no longer has, and the raw edit token
  // is a credential for the source.
  delete registration.emailDeliveryStatus
  delete registration.editToken

  return registration
}

/**
 * Builds the copy. The originals it returns are for `assertCopyIsScrubbed` in the source, and must
 * not be sent with the copy.
 */
export const createEventCopy = (
  source: EventCopy,
  copier: Copier,
  key: Buffer = randomBytes(32)
): { copy: EventCopy; originals: CopyOriginals } => {
  const standIns = createStandIns(copier, key)
  const originals: CopyOriginals = { emails: new Set(), names: new Set(), phones: new Set() }
  collectOriginals(source, originals)

  const event = copyEvent(source.event, copier, standIns, originals)
  const registrations = source.registrations.map((registration) =>
    copyRegistration(registration, copier, standIns, originals)
  )

  const copy = replaceEmails({ event, registrations }, standIns)

  const judgeNames = new Set<string>()
  collectJudgeNames(source, judgeNames)
  for (const name of judgeNames) originals.names.delete(name)

  // The copier is not someone the copy protects: their own address, name and number are meant to
  // be in it.
  originals.emails.delete(withoutPlusTag(copier.email))
  originals.names.delete(normalize(copier.name))
  if (copier.phone) originals.phones.delete(phoneDigits(copier.phone))

  return { copy, originals }
}

/**
 * Judges are public in the calendar and stay in the copy as they are. A judge who also owns a dog
 * in the trial keeps their name in the judge fields while their owner fields get a stand-in, so a
 * judge's name is not a leak.
 */
const collectJudgeNames = (value: unknown, names: Set<string>, underJudge = false) => {
  if (typeof value === 'string') {
    if (underJudge) names.add(normalize(value))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectJudgeNames(item, names, underJudge)
    return
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const judge = key === 'judge' || key === 'judges'
      if (judge || (underJudge && key === 'name')) collectJudgeNames(child, names, true)
      else collectJudgeNames(child, names, false)
    }
  }
}

const eachString = (value: unknown, visit: (text: string, key?: string) => void, key?: string) => {
  if (typeof value === 'string') visit(value, key)
  else if (Array.isArray(value)) for (const item of value) eachString(item, visit)
  else if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) eachString(child, visit, childKey)
  }
}

/**
 * What in the copy could still reach a real person. Without `originals` (on the receiving side) only
 * the shape is checked: every address is the copier's, every phone field is the copier's or a
 * reserved-range number. With them (in the source) also that no original address, name or number
 * survives anywhere.
 */
export const findCopyLeaks = (copy: EventCopy, copier: Copier, originals?: CopyOriginals): string[] => {
  const copierEmail = withoutPlusTag(copier.email)
  const [copierLocal, copierDomain] = copierEmail.split('@')
  const copierPhone = copier.phone ? phoneDigits(copier.phone) : undefined
  const reservedPrefix = phoneDigits(COPY_PHONE_PREFIX)
  const leaks = new Set<string>()

  eachString(copy, (text, key) => {
    for (const match of text.match(EMAIL_RE) ?? []) {
      const email = normalizeEmail(match)
      const isCopier =
        email === copierEmail ||
        (email.startsWith(`${copierLocal}+${COPY_EMAIL_TAG}`) && email.endsWith(`@${copierDomain}`))
      if (!isCopier) leaks.add('email: an address that is not the copier’s')
      if (originals?.emails.has(email)) leaks.add('email: an original address')
    }
    if (key === 'phone' && text.trim()) {
      const digits = phoneDigits(text)
      if (digits !== copierPhone && !digits.startsWith(reservedPrefix)) leaks.add('phone: a number outside 048')
    }
    if (originals?.names.has(normalize(text))) leaks.add('name: an original name')
    if (originals?.phones.has(phoneDigits(text))) leaks.add('phone: an original number')
  })

  return [...leaks]
}

/** Throws, naming only the kind of leak and never the value, if anything in the copy could reach a real person. */
export const assertCopyIsScrubbed = (copy: EventCopy, copier: Copier, originals?: CopyOriginals) => {
  const leaks = findCopyLeaks(copy, copier, originals)
  if (leaks.length) throw new Error(`Event copy rejected: ${leaks.join(', ')}`)
}
