import type { JsonDogEvent, JsonJudge, JsonRegistration, PublicContactInfo, RegistrationOwner } from '../../types'
import { createHmac, randomBytes } from 'node:crypto'
import { judgesMockTrialIndependently } from '../../lib/judge'
import { normalizeEmail, withoutPlusTag } from './email'
import { removeRegistrationCreationMetadata } from './registration'

/**
 * A copy of an event with its registrations for another environment (KOE-1467): prod into test or
 * dev, or between test and dev. Every person in it is replaced before the copy leaves the source,
 * and the copy is checked for anything that got through before it is sent anywhere.
 *
 * Addresses and names are replaced deterministically within one copy — the same original always gets
 * the same stand-in, so logic that compares people (handler = owner, deduplicated recipients) behaves
 * as it did in the source — and keyed with a random secret per copy that is never stored, so a
 * stand-in cannot be traced back by guessing. Numbers compare nothing, and are handed out in order.
 */

/** Who makes the copy: every mail the copy can send goes to this person. */
export interface Copier {
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
}

/**
 * Every number in a copy is a number from this range, handed out in order: what the original was
 * (Finnish or not, however written) makes no difference. Mobile prefix 048 is in Traficom's own
 * number reserve, allocated to no operator (Traficom regulation M 32 V/2025, annex 1). Finland has
 * no range set aside for fiction, and 040 is fully allocated. Check annex 1 again whenever the
 * regulation is renewed.
 */
const COPY_PHONE_PREFIX = '+358 48 '

/** Stands in for free text, which can name anyone and cannot be rewritten reliably. */
export const COPY_REPLACED_TEXT = '[Kopioinnissa korvattu teksti]'

const COPY_EMAIL_TAG = 'kk-'

/**
 * Anything shaped like an address, in linear time: a match starts only where a run of local-part
 * characters starts (the lookbehind), and the domain is dot-separated labels whose class holds no
 * dot, so there is one way to match it (Sonar S5852).
 */
const EMAIL_RE = /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi

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

const digitsOf = (text: string) => text.replace(/\D/g, '')

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
  let phones = 0

  return {
    email: (original: string) => {
      const email = normalizeEmail(original)
      if (withoutPlusTag(email) === copierEmail) return copierEmail
      return emailStandIn(email, hash('email', email))
    },
    name: (original: string) => nameStandIn(normalize(original), hash('name', normalize(original))),
    phone: () => `${COPY_PHONE_PREFIX}${String(++phones).padStart(7, '0')}`,
  }
}

type StandIns = ReturnType<typeof createStandIns>

const collectOriginals = (value: unknown, originals: CopyOriginals) => {
  if (typeof value === 'string') {
    for (const match of value.match(EMAIL_RE) ?? []) originals.emails.add(normalizeEmail(match))
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectOriginals(item, originals)
    return
  }
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) collectOriginals(child, originals)
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
    ...(person.phone ? { phone: standIns.phone() } : {}),
  }
}

const replaceText = (text: string | undefined) => (text?.trim() ? COPY_REPLACED_TEXT : text)

/** Keeps which of name, email and phone the source showed, so the copy's public page shows the same. */
const copierContact = (copier: Copier, standIns: StandIns, original: PublicContactInfo): PublicContactInfo => {
  const phone = copier.phone ?? (original.phone ? standIns.phone() : undefined)
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
  const originals: CopyOriginals = { emails: new Set(), names: new Set() }
  collectOriginals(source, originals)

  const event = copyEvent(source.event, copier, standIns, originals)
  const registrations = source.registrations.map((registration) =>
    copyRegistration(registration, copier, standIns, originals)
  )

  const copy = replaceEmails({ event, registrations }, standIns)

  const judgeNames = new Set<string>()
  collectJudgeNames(source, judgeNames)
  for (const name of judgeNames) originals.names.delete(name)

  // The copier is not someone the copy protects: their own address and name are meant to be in it.
  originals.emails.delete(withoutPlusTag(copier.email))
  originals.names.delete(normalize(copier.name))

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
 * number from 048. With them (in the source) also that no original address or name survives
 * anywhere.
 */
export const findCopyLeaks = (copy: EventCopy, copier: Copier, originals?: CopyOriginals): string[] => {
  const copierEmail = withoutPlusTag(copier.email)
  const [copierLocal, copierDomain] = copierEmail.split('@')
  const copierPhone = copier.phone ? digitsOf(copier.phone) : undefined
  const reservedPrefix = digitsOf(COPY_PHONE_PREFIX)
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
      const digits = digitsOf(text)
      if (digits !== copierPhone && !digits.startsWith(reservedPrefix)) leaks.add('phone: a number outside 048')
    }
    if (originals?.names.has(normalize(text))) leaks.add('name: an original name')
  })

  return [...leaks]
}

/** Throws, naming only the kind of leak and never the value, if anything in the copy could reach a real person. */
export const assertCopyIsScrubbed = (copy: EventCopy, copier: Copier, originals?: CopyOriginals) => {
  const leaks = findCopyLeaks(copy, copier, originals)
  if (leaks.length) throw new Error(`Event copy rejected: ${leaks.join(', ')}`)
}

type Stage = 'prod' | 'test' | 'dev'

/**
 * Where an environment may copy to. Never into prod: prod has no import function to receive a copy
 * (KOE-1471), and this list is the export's own refusal on top of that.
 */
const COPY_TARGETS: Record<Stage, Stage[]> = {
  dev: ['test'],
  prod: ['test', 'dev'],
  test: ['dev'],
}

export const copyTargets = (stage: string): Stage[] =>
  stage === 'prod' || stage === 'test' || stage === 'dev' ? COPY_TARGETS[stage] : []

/**
 * The target's stack, named like this one (`koekalenteri-prod` → `koekalenteri-test`), or undefined
 * where this stack's name does not end in its stage (a local run).
 */
export const targetStackName = (stackName: string, stage: string, target: string) =>
  stage && stackName.endsWith(`-${stage}`) ? `${stackName.slice(0, -stage.length)}${target}` : undefined

export const importFunctionName = (stack: string) => `${stack}-ImportCopiedEvent`

/** What the export hands the target's import function. The originals never leave the source. */
export interface CopyImportRequest {
  copy: EventCopy
  copier: Copier
  /** Matched by Kennel Club number: organizer ids are generated in each environment. */
  organizerKcId: number
  source: { stage: string; eventId: string }
}

type JudgeNoticeReason = 'missing' | 'inactive' | 'eventType' | 'mockTrial'

export interface JudgeNotice {
  name: string
  reason: JudgeNoticeReason
}

export interface CopyImportResult {
  eventId: string
  judges: JudgeNotice[]
}

/**
 * The event's Kennel Club judges the target cannot use as they are: the event form checks judges
 * against the target's own list, and a Mock trial will not save without judges who may judge it on
 * their own there. Reported by name for an admin to settle; the import fetches and activates no one.
 */
export const judgeNotices = (event: Pick<JsonDogEvent, 'eventType' | 'judges' | 'mockTrial'>, judges: JsonJudge[]) => {
  const notices: JudgeNotice[] = []
  for (const eventJudge of event.judges) {
    if (!eventJudge.id || eventJudge.id < 0) continue
    const judge = judges.find((j) => j.id === eventJudge.id && !j.deletedAt)
    const name = eventJudge.name
    if (!judge) notices.push({ name, reason: 'missing' })
    else if (judge.active === false) notices.push({ name, reason: 'inactive' })
    else if (!judge.eventTypes.includes(event.eventType)) notices.push({ name, reason: 'eventType' })
    else if (event.mockTrial && !judgesMockTrialIndependently(judge)) notices.push({ name, reason: 'mockTrial' })
  }
  return notices
}

/** Every invitation attachment the event and its registrations point at, each once. */
export const attachmentKeys = (copy: EventCopy) => {
  const keys = new Set<string>()
  const { invitationAttachment, invitationAttachments, invitationAttachmentHistory } = copy.event
  if (invitationAttachment) keys.add(invitationAttachment)
  for (const key of Object.values(invitationAttachments ?? {})) if (key) keys.add(key)
  for (const key of Object.keys(invitationAttachmentHistory ?? {})) keys.add(key)
  for (const registration of copy.registrations) {
    if (registration.invitationAttachment) keys.add(registration.invitationAttachment)
  }
  return [...keys]
}
