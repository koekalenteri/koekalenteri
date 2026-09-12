import type { ParseKeys } from 'i18next'
import type {
  JsonAuditChange,
  JsonAuditChangeValue,
  JsonAuditRecord,
  JsonConfirmedEvent,
  JsonDog,
  JsonRegistration,
  JsonTestResult,
  RegistrationBreeder,
  RegistrationPerson,
} from '../../types'
import { formatDate } from '../../i18n/dates'
import { getFixedT } from '../../i18n/lambda'
import { getCostSegmentName, getCostSegmentNameOptions } from '../../lib/cost'
import { getNestedChanges } from '../../lib/diff'
import { getRegistrationOwners, getSelectedAdditionalCosts, resolveOwnerSelection } from '../../lib/registration'
import { logger } from './log'

/**
 * What a registration's audit trail says of an edit: which sections changed, and for each the value
 * before and after, as text. The same row shape the event's trail uses (`getEventAuditMessages`),
 * so the trail renders both alike (KOE-1419).
 */

type AuditedEvent = Pick<JsonConfirmedEvent, 'cost' | 'costMember' | 'entryStartDate'>
type Translate = ReturnType<typeof getFixedT>

/** One line of a section's text: the sub-field's label (empty for a field that is one value) and its text. */
type Line = readonly [label: string, text: string]

type AuditedField =
  | 'class'
  | 'dates'
  | 'reserve'
  | 'dog'
  | 'breeder'
  | 'owners'
  | 'ownerHandles'
  | 'handler'
  | 'ownerPays'
  | 'payer'
  | 'optionalCosts'
  | 'selectedCost'
  | 'results'
  | 'qualifyingResults'
  | 'language'
  | 'notes'

interface AuditedChange extends JsonAuditChange {
  field: AuditedField
  labelKey: ParseKeys<'translation'>
}

interface AuditedFieldText {
  field: AuditedField
  labelKey: ParseKeys<'translation'>
  lines: (registration: JsonRegistration, event: AuditedEvent, t: Translate) => Line[]
}

const single = (text: string | undefined | null): Line[] => [['', text ?? '']]

const yesNo = (value: boolean | undefined, t: Translate) => {
  if (value === undefined) return ''
  return value ? t('audit.yes') : t('audit.no')
}

const personLines = (person: Partial<RegistrationPerson> | undefined, t: Translate): Line[] =>
  person
    ? [
        [t('contact.name'), person.name ?? ''],
        [t('contact.email'), person.email ?? ''],
        [t('contact.phone'), person.phone ?? ''],
        [t('contact.city'), person.location ?? ''],
        [t('registration.member'), yesNo(person.membership, t)],
      ]
    : []

const breederLines = (breeder: Partial<RegistrationBreeder> | undefined, t: Translate): Line[] =>
  breeder ? [[t('contact.name'), breeder.name ?? '']] : []

const dogNameText = (dog: Pick<JsonDog, 'name' | 'titles'> | undefined) =>
  [dog?.titles, dog?.name].filter(Boolean).join(' ')

// The dog's results, refresh date and Kennelliitto id are the dog table's, written on every save
// (KOE-1346), so they are not the participant's edits and stay off the trail.
const dogLines = (dog: JsonDog, t: Translate): Line[] => [
  [t('dog.regNo'), dog.regNo],
  [t('dog.name'), dog.name ?? ''],
  [t('dog.titles'), dog.titles ?? ''],
  [t('dog.rfid'), dog.rfid ?? ''],
  [t('dog.dob'), dog.dob ? formatDate(dog.dob, 'd.M.yyyy') : ''],
  [t('dog.gender'), dog.gender ? t(`dog.genderChoises.${dog.gender}`) : ''],
  [t('dog.breed'), dog.breedCode ? t(dog.breedCode, { defaultValue: dog.breedCode, ns: 'breed' }) : ''],
  [t('dog.sire.name'), dogNameText(dog.sire)],
  [t('dog.dam.name'), dogNameText(dog.dam)],
]

const personText = (person: Partial<RegistrationPerson>, t: Translate) => {
  const contact = [person.name, person.email, person.phone, person.location].filter(Boolean).join(', ')
  return person.membership ? `${contact} (${t('registration.member').toLowerCase()})` : contact
}

// The client mirrors `owners[0]` into `owner`, so both are read as one list; a key-only change is
// not an edit anyone made.
const ownerLines = (registration: JsonRegistration, t: Translate): Line[] =>
  getRegistrationOwners(registration).map((owner, index) => [
    t('registration.ownerNumber', { number: index + 1 }),
    personText(owner, t),
  ])

/** The owner an `ownerHandles`/`ownerPays` selection names, or "someone else". */
const selectionText = (registration: JsonRegistration, selection: boolean | string | undefined, t: Translate) =>
  resolveOwnerSelection(registration.owners, registration.owner, selection)?.name ?? t('registration.someoneElse')

const datesText = (registration: JsonRegistration, t: Translate) =>
  (registration.dates ?? [])
    .map(({ date, time }) => {
      const day = formatDate(date, 'eeeeee d.M.yyyy')
      const half = time && time !== 'kp' ? t(`registration.time.${time}`) : ''
      return half ? `${day} ${half}` : day
    })
    .join(', ')

const resultLines = (results: JsonTestResult[] | undefined): Line[] =>
  (results ?? []).map((result) => {
    const held = [result.type, result.class, formatDate(result.date, 'd.M.yyyy'), result.location]
      .filter(Boolean)
      .join(' ')
    return ['', result.judge ? `${held}: ${result.result}, ${result.judge}` : `${held}: ${result.result}`]
  })

const selectedCostText = (registration: JsonRegistration, event: AuditedEvent, t: Translate) => {
  const segment = registration.selectedCost
  if (!segment || !event.cost) return ''
  if (typeof event.cost === 'number') return t('costNames.normal')

  const options = getCostSegmentNameOptions(segment, event.cost, event, registration.dog.breedCode, 'fi')
  return t(getCostSegmentName(segment), options)
}

const AUDITED_FIELDS: readonly AuditedFieldText[] = [
  { field: 'class', labelKey: 'registration.class', lines: (r) => single(r.class) },
  { field: 'dates', labelKey: 'registration.dates', lines: (r, _e, t) => single(datesText(r, t)) },
  {
    field: 'reserve',
    labelKey: 'registration.reserve',
    lines: (r, _e, t) => single(r.reserve ? t(`registration.reserveChoises.${r.reserve}`) : ''),
  },
  { field: 'dog', labelKey: 'registration.dog', lines: (r, _e, t) => (r.dog ? dogLines(r.dog, t) : []) },
  { field: 'breeder', labelKey: 'registration.breeder', lines: (r, _e, t) => breederLines(r.breeder, t) },
  { field: 'owners', labelKey: 'registration.owners', lines: (r, _e, t) => ownerLines(r, t) },
  {
    field: 'ownerHandles',
    labelKey: 'registration.ownerHandles',
    lines: (r, _e, t) => single(selectionText(r, r.ownerHandles, t)),
  },
  { field: 'handler', labelKey: 'registration.handler', lines: (r, _e, t) => personLines(r.handler, t) },
  {
    field: 'ownerPays',
    labelKey: 'registration.ownerPays',
    lines: (r, _e, t) => single(selectionText(r, r.ownerPays, t)),
  },
  { field: 'payer', labelKey: 'registration.payer', lines: (r, _e, t) => personLines(r.payer, t) },
  {
    field: 'optionalCosts',
    labelKey: 'costNames.optionalAdditionalCosts',
    lines: (r, e) =>
      single(
        e.cost
          ? getSelectedAdditionalCosts(e, r)
              .map((cost) => cost.description.fi)
              .join(', ')
          : ''
      ),
  },
  { field: 'selectedCost', labelKey: 'cost', lines: (r, e, t) => single(selectedCostText(r, e, t)) },
  { field: 'results', labelKey: 'registration.results', lines: (r) => resultLines(r.results) },
  {
    field: 'qualifyingResults',
    labelKey: 'registration.qualifyingResults',
    lines: (r) => resultLines(r.qualifyingResults),
  },
  {
    field: 'language',
    labelKey: 'registration.language',
    lines: (r, _e, t) => single(r.language ? t(`language.${r.language}`) : ''),
  },
  { field: 'notes', labelKey: 'registration.notes', lines: (r) => single(r.notes) },
]

const value = (text: string): JsonAuditChangeValue => (text ? { text } : { state: 'empty' })

const lineText = ([label, text]: Line) => (label ? `${label}: ${text}` : text)

/**
 * The two sides of a section, reduced to the lines that differ: a changed name shows as the name
 * alone, not the whole person, and a section that appeared or vanished shows whole against empty.
 */
const sectionChange = (previous: Line[], next: Line[]) => {
  const previousByLabel = new Map(previous.map(([label, text]) => [label, text]))
  const nextByLabel = new Map(next.map(([label, text]) => [label, text]))
  const labels = [...new Set([...nextByLabel.keys(), ...previousByLabel.keys()])]
  const changed = labels.filter((label) => (previousByLabel.get(label) ?? '') !== (nextByLabel.get(label) ?? ''))
  if (!changed.length) return undefined

  const text = (lines: Line[]) =>
    lines
      .filter(([label]) => changed.includes(label))
      .map(lineText)
      .join('\n')
  return { next: value(text(next)), previous: value(text(previous)) }
}

/** The audit row of a registration edit, or `undefined` when nothing the trail follows changed. */
export const getRegistrationChanges = (
  existing: JsonRegistration,
  data: JsonRegistration,
  event: AuditedEvent
): Pick<JsonAuditRecord, 'changes' | 'message' | 'messageKey'> | undefined => {
  const t = getFixedT('fi')
  logger.debug('audit changes', { changes: getNestedChanges(existing, data) })

  const changes: AuditedChange[] = []
  for (const { field, labelKey, lines } of AUDITED_FIELDS) {
    const change = sectionChange(lines(existing, event, t), lines(data, event, t))
    if (change) changes.push({ field, labelKey, ...change })
  }

  // The client mirrors the owner the ownerHandles/ownerPays selection names into `handler`/`payer`,
  // so editing that owner also changes the mirror; report it once, under the owner list.
  const changedFields = new Set(changes.map((change) => change.field))
  const mirrored = (selection: boolean | string | undefined) =>
    changedFields.has('owners') && Boolean(resolveOwnerSelection(data.owners, data.owner, selection))
  const reported = changes.filter(
    ({ field }) =>
      !(field === 'handler' && mirrored(data.ownerHandles)) && !(field === 'payer' && mirrored(data.ownerPays))
  )
  if (!reported.length) return undefined

  return {
    changes: reported,
    message: `Muutti: ${reported.map((change) => t(change.labelKey)).join(', ')}`,
    messageKey: 'audit.changed',
  }
}
