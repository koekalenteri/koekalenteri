import type {
  DayKey,
  DogGender,
  JsonConfirmedEvent,
  JsonDog,
  JsonKcResult,
  JsonKcState,
  JsonRegistration,
  Patch,
  PublicJudge,
} from '../types'
import { dayOf, isDayKey, TIME_ZONE } from './day'
import { isMicrochip } from './dog'
import { hasRetrieveTypeChoice, isMockTrialClass } from './event'
import { makeArray } from './judge'
import { getRegistrationGroupDay, getRegistrationPlacement } from './registration'
import { parseEventResultCode, resultMarks, resultPrefixAsKennelClub, scoresAtPosts, shownEventResult } from './results'

/**
 * Turning a dog's recorded result into the body Kennelliitto's Koe/Tulos/Tallenna takes (KOE-1140).
 *
 * Pure on purpose: the pre-check the secretary sees and the sending run this same function, so the
 * dialog cannot promise a result the server then refuses to send.
 */

/** The states of a trial in Kennelliitto that this code acts on (Koe/Lue `tila`, Testi2 15.10.2026). */
const KC_STATE_OPEN = 754
/** Handed to the chief judge for approval. Koe/AsetaTila takes this code. */
export const KC_STATE_HANDED_OVER = 1253
const KC_STATE_COMPLETED = 304

/** Results can be written to Kennelliitto only while the trial is in this state. */
export const isKcStateWritable = (code: number): boolean => code === KC_STATE_OPEN

/**
 * Whether the trial's results are out of the secretary's hands: handed to the chief judge or
 * finished. Only a fresh reading of the state lifts it, so a judge who sends the trial back unlocks it.
 */
export const isResultsLocked = (event: { kcState?: Pick<JsonKcState, 'code'> }): boolean =>
  event.kcState?.code === KC_STATE_HANDED_OVER || event.kcState?.code === KC_STATE_COMPLETED

/**
 * How many of the dogs have their result in Omakoira. Every entry counts, cancelled or not: what was
 * sent is in Kennelliitto whatever happened to the entry since, and the hand-over decides what it
 * covers. The results page's notice and the event view's hand-over both read it, so they agree (KOE-1579).
 */
export const countSentResults = (registrations: ReadonlyArray<{ kcResult?: Pick<JsonKcResult, 'status'> }>): number =>
  registrations.filter((registration) => registration.kcResult?.status === 'sent').length

/** Koe/Koemuoto `tulostyyppi` of the result itself and of an additional info. */
const RESULT_TYPE = 247
const INFO_TYPE = 250

export interface KcKoemuotoResult {
  hylätty: boolean
  keskeytys: boolean
  tulos: string
  tulostyyppi: number
}

/** What of Koe/Koemuoto the mapping reads. Structural, so the lambda passes its own answer as it is. */
export interface KcKoemuoto {
  koemuoto: string
  tarkenteet: string[]
  tulokset: KcKoemuotoResult[]
}

export type KcResultEvent = Pick<
  JsonConfirmedEvent,
  'classes' | 'eventType' | 'judges' | 'kcGuid' | 'mockTrial' | 'retrieveType'
>

export type KcResultRegistration = Pick<
  JsonRegistration,
  'class' | 'dog' | 'eventResult' | 'group' | 'id' | 'startGroup'
>

/** The body of Koe/Tulos/Tallenna. Built in one place, so equal results give equal bodies and equal hashes. */
export interface KcResultBody {
  koeGUID: string
  rekisterinumero: string
  nimi: string
  päivä: string
  tulos: string
  hylätty: boolean
  keskeytetty: boolean
  tuomarit: number[]
  palkintotuomarit: number[]
  pisteet?: number
  /** The rank among the awarded dogs of the class and day. Only the formats scored at posts have one. */
  sijoitus?: number
  lisätiedot?: string
  tarkenne?: string
}

export type KcProblemCode =
  | 'noKcGuid'
  | 'noResult'
  | 'noDay'
  | 'noName'
  | 'noPlacement'
  | 'dayNotReached'
  | 'dayChanged'
  | 'resultNotAllowed'
  | 'stopNotAllowed'
  | 'noJudge'
  | 'judgeWithoutNumber'
  | 'tooManyJudges'
  | 'additionalInfoNotAllowed'
  | 'retrieveTypeNotAllowed'
  /* What a foreign dog Kennelliitto does not know lacks before it can be added there (KOE-1201). */
  | 'noMicrochip'
  | 'microchipInvalid'
  | 'noGender'
  | 'noBirthDate'
  | 'noBreed'
  | 'countryUnknown'
  /* A foreign dog Kennelliitto knows by another registration number (KOE-1653). */
  /** No choice was made for it, so nothing was sent; `detail` is Kennelliitto's number. */
  | 'kcRegNoDiffers'
  /** Another entry of the trial already has Kennelliitto's number (`detail`): the same dog entered twice. */
  | 'kcRegNoTaken'
  /** The number could not be changed here, so nothing was sent. */
  | 'kcRegNoNotChanged'

export interface KcProblem {
  code: KcProblemCode
  /** What the problem names: the result, the judge, the additional info. */
  detail?: string
}

type KcResultOutcome = { body: KcResultBody; ok: true } | { ok: false; problems: KcProblem[] }

/** Kennelliitto takes at most this many judges besides the chief. */
const MAX_PRIZE_JUDGES = 4

/** Letters only, lower case: `vara-SERT`, `vara sert` and `Vara Sert` are one name. */
const nameKey = (value: string): string => value.toLocaleLowerCase('fi').replace(/[^\p{Letter}\p{Number}]+/gu, '')

/**
 * Kennelliitto's spelling of the result. Koekalenteri stores the class or the event type in front of
 * the code (`NOME-A1`, `NOME-A SM1`) where Kennelliitto's own list says `A1`, so the string is rebuilt
 * from the code and has to be one of the format's results, never guessed.
 */
const resultCodeOf = (registration: KcResultRegistration, event: KcResultEvent) =>
  parseEventResultCode(registration.eventResult?.result, event.eventType, registration.class ?? undefined)

const klResultOf = (registration: KcResultRegistration, event: KcResultEvent, koemuoto: KcKoemuoto) => {
  const code = resultCodeOf(registration, event)
  if (!code) return undefined
  const tulos = `${resultPrefixAsKennelClub(koemuoto.koemuoto, registration.class ?? undefined)}${code}`
  return koemuoto.tulokset.find((row) => row.tulostyyppi === RESULT_TYPE && row.tulos === tulos)
}

const judgeId = (judge: PublicJudge): number | undefined => (judge.id ? judge.id : undefined)

/** Every judge who judged the dog, the one that judged most of it first. */
const judgesOf = (registration: KcResultRegistration, event: KcResultEvent): PublicJudge[] => {
  const result = registration.eventResult
  const classJudges = makeArray(event.classes.find((item) => item.class === registration.class)?.judge)
  const chiefFallback = classJudges[0] ?? event.judges[0]

  if (scoresAtPosts(event.eventType)) {
    const posts = (result?.tasks ?? []).flatMap((task) => (task.judge ? [task.judge] : []))
    return [chiefFallback, ...posts].filter((judge): judge is PublicJudge => Boolean(judge))
  }
  return [result?.judge ?? chiefFallback].filter((judge): judge is PublicJudge => Boolean(judge))
}

type JudgeOutcome = { palkintotuomarit: number[]; tuomarit: number[] } | { problems: KcProblem[] }

const judgeNumbers = (registration: KcResultRegistration, event: KcResultEvent): JudgeOutcome => {
  const judges = judgesOf(registration, event)

  const unnumbered = judges.filter((judge) => judgeId(judge) === undefined)
  if (unnumbered.length) {
    return { problems: unnumbered.map((judge) => ({ code: 'judgeWithoutNumber', detail: judge.name })) }
  }

  // With no judge at all there is no chief either.
  const [chief, ...others] = [...new Set(judges.flatMap((judge) => judgeId(judge) ?? []))]
  if (chief === undefined) return { problems: [{ code: 'noJudge' }] }
  if (others.length > MAX_PRIZE_JUDGES) return { problems: [{ code: 'tooManyJudges' }] }
  return { palkintotuomarit: others, tuomarit: [chief] }
}

const infoRow = (koemuoto: KcKoemuoto, key: string) =>
  koemuoto.tulokset.find((row) => row.tulostyyppi === INFO_TYPE && nameKey(row.tulos) === key)

/** The additional infos the dog earned, spelled as Kennelliitto's format lists them. */
const additionalInfo = (
  registration: KcResultRegistration,
  event: KcResultEvent,
  koemuoto: KcKoemuoto
): { infos: string[] } | { problems: KcProblem[] } => {
  const wanted: Array<[boolean, string, string]> = [
    [Boolean(registration.eventResult?.cert), 'sert', 'sert'],
    [Boolean(registration.eventResult?.resCert), 'varasert', 'vara sert'],
  ]
  const infos: string[] = []
  const problems: KcProblem[] = []
  for (const [earned, key, label] of wanted) {
    if (!earned) continue
    const row = infoRow(koemuoto, key)
    if (row) infos.push(row.tulos)
    else problems.push({ code: 'additionalInfoNotAllowed', detail: label })
  }
  // A Mock trial is the event's property, but Kennelliitto holds it as an additional info of the result.
  if (event.mockTrial && registration.class && isMockTrialClass(registration.class)) {
    const row = infoRow(koemuoto, 'mocktrial')
    if (row) infos.push(row.tulos)
  }
  return problems.length ? { problems } : { infos }
}

/**
 * The trial type of a B-trial, as Kennelliitto's format lists it, or why there is none. A trial from
 * before the choice existed (KOE-439) has none, and is sent as a game trial (KOE-1570).
 */
const tarkenneOf = (event: KcResultEvent, koemuoto: KcKoemuoto): { tarkenne?: string } | { problems: KcProblem[] } => {
  if (!hasRetrieveTypeChoice(event.eventType)) return {}

  const wanted = event.retrieveType === 'dummies' ? 'damikoe' : 'riistakoe'
  const tarkenne = koemuoto.tarkenteet.find((item) => nameKey(item) === wanted)
  return tarkenne ? { tarkenne } : { problems: [{ code: 'retrieveTypeNotAllowed', detail: wanted }] }
}

/** Whether the format has any result that is a stop, which is the only place a judge's stop can go. */
const formatAllowsStop = (koemuoto: KcKoemuoto): boolean => koemuoto.tulokset.some((row) => row.keskeytys)

/**
 * The day of the dog's own run, as Kennelliitto writes it: the frozen placement's over the working
 * order's, as the trial's calendar day. The one rule `placementsFor` ranks by as well, so the rank sent
 * with a result is the rank among the dogs of the day it is sent for.
 */
export const kcResultDay = (registration: Pick<KcResultRegistration, 'group' | 'startGroup'>): string | undefined =>
  getRegistrationGroupDay(getRegistrationPlacement(registration)?.date) || undefined

/**
 * The percentage NOWT sends in place of points: `points * 100 / maxPoints` as recorded, and 0 for a
 * round that was stopped, which has no total (the dash is sent with points 0, Juha). Nothing is
 * rounded, and nothing is checked against the result's limits, which Kennelliitto's own list gets
 * wrong for ALO0 and ALO-: it answers with its reasons when it refuses a number.
 */
const pointsOf = (registration: KcResultRegistration): number => registration.eventResult?.percentage ?? 0

/**
 * The placement Kennelliitto takes with a NOWT result: the rank `placementsFor` derived for the dog over
 * every dog of the trial, which is why it is an input here and not computed from the one registration.
 * The API says a placement is given only where the format's results have one, so the other formats send
 * none. An awarded dog (prize 1, 2 or 3) that has no rank has no points to be ranked by (a voided round
 * whose code was overridden), and is not sent until it has.
 */
const placementOf = (
  event: KcResultEvent,
  registration: KcResultRegistration,
  placement: number | undefined
): { sijoitus?: number } | { problems: KcProblem[] } => {
  if (!scoresAtPosts(event.eventType)) return {}
  const code = resultCodeOf(registration, event)
  const awarded = code === '1' || code === '2' || code === '3'
  if (!awarded) return {}
  return placement === undefined ? { problems: [{ code: 'noPlacement' }] } : { sijoitus: placement }
}

const problemsOf = (outcome: object & { problems?: KcProblem[] }): KcProblem[] => outcome.problems ?? []

/** What is missing from the dog or the trial before the result itself is looked at. */
const basicProblems = (
  event: KcResultEvent,
  registration: KcResultRegistration,
  day: string | undefined
): KcProblem[] => {
  const problems: KcProblem[] = []
  if (!event.kcGuid) problems.push({ code: 'noKcGuid' })
  if (!registration.eventResult?.result) problems.push({ code: 'noResult' })
  if (!registration.dog.name?.trim() || !registration.dog.regNo?.trim()) problems.push({ code: 'noName' })
  if (!day) problems.push({ code: 'noDay' })
  return problems
}

/** The result's own problems: Kennelliitto's format does not list it, or it cannot carry the judge's stop. */
const resultProblems = (
  registration: KcResultRegistration,
  event: KcResultEvent,
  koemuoto: KcKoemuoto,
  row: KcKoemuotoResult | undefined
): KcProblem[] => {
  if (!row) {
    const detail = shownEventResult(registration.eventResult?.result, event.eventType, registration.class ?? undefined)
    return [{ code: 'resultNotAllowed', detail }]
  }
  const interrupted = resultMarks(registration.eventResult).length > 0
  return interrupted && !formatAllowsStop(koemuoto) ? [{ code: 'stopNotAllowed', detail: row.tulos }] : []
}

/**
 * The Tallenna body for one dog, or what stands in the way. `koemuoto` is Kennelliitto's answer for
 * the format the trial itself reports (Koe/Lue), never one derived from the event type here, and
 * `placement` is the dog's rank among the trial's dogs (`placementsFor`), which one registration cannot tell.
 */
export const buildKcResult = (
  event: KcResultEvent,
  registration: KcResultRegistration,
  koemuoto: KcKoemuoto,
  placement?: number
): KcResultOutcome => {
  const day = kcResultDay(registration)
  const basic = basicProblems(event, registration, day)
  const row = basic.length ? undefined : klResultOf(registration, event, koemuoto)
  const judges = judgeNumbers(registration, event)
  const info = additionalInfo(registration, event, koemuoto)
  const type = tarkenneOf(event, koemuoto)
  const rank = placementOf(event, registration, placement)
  const problems = [
    ...basic,
    ...(basic.length ? [] : resultProblems(registration, event, koemuoto, row)),
    ...problemsOf(judges),
    ...problemsOf(info),
    ...problemsOf(type),
    ...problemsOf(rank),
  ]

  if (problems.length || 'problems' in judges || 'problems' in info || 'problems' in type || 'problems' in rank) {
    return { ok: false, problems }
  }
  const name = registration.dog.name?.trim()
  const regNo = registration.dog.regNo?.trim()
  if (!row || !day || !name || !regNo || !event.kcGuid) return { ok: false, problems }

  return {
    body: {
      hylätty: row.hylätty,
      keskeytetty: row.keskeytys || resultMarks(registration.eventResult).length > 0,
      koeGUID: event.kcGuid,
      nimi: name,
      palkintotuomarit: judges.palkintotuomarit,
      päivä: day,
      rekisterinumero: regNo,
      tulos: row.tulos,
      tuomarit: judges.tuomarit,
      ...(scoresAtPosts(event.eventType) ? { pisteet: pointsOf(registration) } : {}),
      ...(rank.sijoitus === undefined ? {} : { sijoitus: rank.sijoitus }),
      ...(info.infos.length ? { lisätiedot: info.infos.join(', ') } : {}),
      ...(type.tarkenne ? { tarkenne: type.tarkenne } : {}),
    },
    ok: true,
  }
}

/** A country of Kennelliitto's list (Yleista/Maat). Structural, so the lambda passes its answer as it is. */
export interface KcCountry {
  maaKoodi: string
  maa: string
  rekisterit: string[]
}

/** The country a foreign dog is added to Kennelliitto with: the code it takes, and the name a person reads. */
export interface KcDogCountry {
  code: string
  name: string
}

/** The body of Koira/Ulkomainen, every field of which Kennelliitto requires. */
export interface KcForeignDogBody {
  maa: string
  nimi: string
  rekisterinumero: string
  rotukoodi: string
  sukupuoli: number
  /** yyyy-MM-dd */
  syntymäaika: string
  tunnistusmerkintä: string
}

type KcForeignDog = Pick<JsonDog, 'breedCode' | 'dob' | 'gender' | 'name' | 'regNo' | 'rfid'>

/** Kennelliitto's `id_Sukupuoli` (Testi2, 27.10.2026). */
export const KC_GENDER: Record<DogGender, number> = { F: 102, M: 101 }

/** The sex of Kennelliitto's `id_Sukupuoli`, the other way round from `KC_GENDER`. */
export const dogGenderOfKc = (id: number | null | undefined): DogGender | undefined => {
  if (id === KC_GENDER.F) return 'F'
  if (id === KC_GENDER.M) return 'M'
  return undefined
}

/** A Finnish dog is never added as a foreign one, whatever its number looks like. */
const FINLAND = 'FI'

/** A letter right after a registry prefix makes it part of a longer one: "S" is not the start of "SF06626/92". */
const endsPrefix = (char: string | undefined): boolean => char === undefined || !/\p{Letter}/u.test(char)

/**
 * The country of a foreign dog, from the start of its registration number and Kennelliitto's registries
 * (KOE-1201). The longest registry the number starts with decides, compared without case and with the
 * spaces Kennelliitto leaves around its codes trimmed. A number no registry matches, and a prefix two
 * countries share ("RI" is both MG and PT), give no country.
 */
export const kcCountryOfRegNo = (
  regNo: string,
  countries: ReadonlyArray<KcCountry>
): { country: KcDogCountry } | { problem: KcProblem } => {
  const number = regNo.trim().toUpperCase()
  const matches = countries
    .filter((country) => country.maaKoodi.trim() !== FINLAND)
    .flatMap((country) =>
      country.rekisterit
        .map((registry) => registry.trim().toUpperCase())
        .filter((prefix) => prefix && number.startsWith(prefix) && endsPrefix(number[prefix.length]))
        .map((prefix) => ({ country, prefix }))
    )
  const longest = Math.max(0, ...matches.map(({ prefix }) => prefix.length))
  const best = matches.filter(({ prefix }) => prefix.length === longest)
  const codes = [...new Set(best.map(({ country }) => country.maaKoodi.trim()))]
  const [first] = best
  if (first && codes.length === 1) return { country: { code: codes[0], name: first.country.maa.trim() } }
  const detail = first ? `${first.prefix} (${codes.join(', ')})` : regNo.trim()
  return { problem: { code: 'countryUnknown', detail } }
}

/** What of the dog's own details Koira/Ulkomainen would refuse. */
const foreignDogProblems = (dog: KcForeignDog): KcProblem[] => {
  const problems: KcProblem[] = []
  const rfid = dog.rfid?.trim()
  if (!rfid) problems.push({ code: 'noMicrochip' })
  else if (!isMicrochip(rfid)) problems.push({ code: 'microchipInvalid', detail: rfid })
  if (!dog.gender) problems.push({ code: 'noGender' })
  if (!isDayKey(dog.dob)) problems.push({ code: 'noBirthDate' })
  if (!dog.breedCode) problems.push({ code: 'noBreed' })
  return problems
}

/**
 * The Koira/Ulkomainen body for a dog Kennelliitto does not know, or everything that stands in the way
 * (KOE-1201). The name and the number are the ones `buildKcResult` sends, so the result that follows
 * names the dog as it was added.
 */
export const buildKcForeignDog = (
  dog: KcForeignDog,
  countries: ReadonlyArray<KcCountry>
): { body: KcForeignDogBody; country: KcDogCountry } | { problems: KcProblem[] } => {
  const name = dog.name?.trim()
  const regNo = dog.regNo?.trim()
  if (!name || !regNo) return { problems: [{ code: 'noName' }] }

  const found = kcCountryOfRegNo(regNo, countries)
  const problems = [...foreignDogProblems(dog), ...('problem' in found ? [found.problem] : [])]
  const { breedCode, dob, gender } = dog
  const rfid = dog.rfid?.trim()
  if (problems.length || !('country' in found) || !breedCode || !gender || !isDayKey(dob) || !rfid) {
    return { problems }
  }
  return {
    body: {
      maa: found.country.code,
      nimi: name,
      rekisterinumero: regNo,
      rotukoodi: breedCode,
      sukupuoli: KC_GENDER[gender],
      syntymäaika: dob,
      tunnistusmerkintä: rfid,
    },
    country: found.country,
  }
}

/** Which lookup found the dog in Kennelliitto: its number, its microchip or its exact name (KOE-1653). */
export type KcFoundBy = 'regNo' | 'microchip' | 'name'

/**
 * A dog Kennelliitto knows under another registration number than the entry has (KOE-1653), with what
 * the secretary compares it by. Kennelliitto's empty birth date (0001-01-01) is no date.
 */
export interface KcKnownDog {
  breedCode?: string
  dob?: DayKey
  foundBy: KcFoundBy
  gender?: DogGender
  name: string
  regNo: string
  /** Empty when Kennelliitto has no microchip for the dog. */
  rfid: string
}

/** What of a Koira answer `kcKnownDogOf` reads. Structural, so the lambda passes its answer as it is. */
interface KcDogAnswer {
  id_Sukupuoli: number | null
  nimi: string
  rekisterinumero: string
  rotukoodi: string
  syntymäaika: string | null
  tunnistusmerkintä: string
}

export const kcKnownDogOf = (answer: KcDogAnswer, foundBy: KcFoundBy): KcKnownDog => {
  const dob = answer.syntymäaika?.slice(0, 10)
  const gender = dogGenderOfKc(answer.id_Sukupuoli)
  const breedCode = answer.rotukoodi.trim()
  return {
    ...(breedCode ? { breedCode } : {}),
    ...(isDayKey(dob) ? { dob } : {}),
    foundBy,
    ...(gender ? { gender } : {}),
    name: answer.nimi.trim(),
    regNo: answer.rekisterinumero.trim(),
    rfid: answer.tunnistusmerkintä.trim(),
  }
}

/** The details of a dog the secretary compares between the entry and Kennelliitto. */
export type KcDogField = 'regNo' | 'name' | 'rfid' | 'dob' | 'breed' | 'gender'

/** A dog as the comparison reads it: the entry's, or Kennelliitto's, whose breed code is any code it gives. */
export type KcComparedDog = Pick<JsonDog, 'dob' | 'gender' | 'name' | 'regNo' | 'rfid'> & { breedCode?: string }

const sameText = (a: string | undefined, b: string) =>
  (a ?? '').trim().toLocaleUpperCase('fi') === b.toLocaleUpperCase('fi')

/**
 * Where the entry's dog and Kennelliitto's differ. What Kennelliitto does not have (no microchip, no birth
 * date, no breed or sex) is no difference: there is nothing to compare with (KOE-1653).
 */
export const kcDogDifferences = (ours: KcComparedDog, kcDog: KcKnownDog): KcDogField[] => {
  const differs: Array<[KcDogField, boolean]> = [
    ['regNo', !sameText(ours.regNo, kcDog.regNo)],
    ['name', !sameText(ours.name, kcDog.name)],
    ['rfid', kcDog.rfid !== '' && ours.rfid?.trim() !== kcDog.rfid],
    ['dob', kcDog.dob !== undefined && ours.dob !== kcDog.dob],
    ['breed', kcDog.breedCode !== undefined && ours.breedCode !== kcDog.breedCode],
    ['gender', kcDog.gender !== undefined && ours.gender !== kcDog.gender],
  ]
  return differs.filter(([, differ]) => differ).map(([field]) => field)
}

/**
 * What the secretary may do with a dog Kennelliitto knows by another number, besides leaving its result
 * unsent for now: take Kennelliitto's number. Adding a dog found by its name as a new one is not offered:
 * Kennelliitto refuses to add a dog of exactly the same name ("Koira löytyy jo nimellä").
 */
export type KcRegNoChoice = 'switch'

/** The choices a sending carries, by registration id. A dog left out of it is not sent. */
export type KcRegNoChoices = Partial<Record<string, KcRegNoChoice>>

export const isKcRegNoChoice = (value: unknown): value is KcRegNoChoice => value === 'switch'

/** A day as a person reads it, d.M.yyyy: the form a message that names a day carries. */
export const finnishDay = (day: string): string => {
  const [year, month, date] = day.split('-')
  return `${Number(date)}.${Number(month)}.${year}`
}

/** Results can be written on the trial day or later (Juha): the dog's day must have begun in Finland. */
export const isKcDayReached = (day: string, now: Date): boolean => day <= dayOf(now, TIME_ZONE)

/* What the secretary's page and the endpoint say to each other (KOE-1140). */

export type KcDogStatus =
  /** A body can be sent and none has been. */
  | 'ready'
  /** Sent before, and the result is different now. */
  | 'changed'
  /** Sent, and what would be sent now is what was sent. */
  | 'unchanged'
  /** There is a result that cannot be sent, `problems` say why. */
  | 'blocked'
  /** A dog that ran and has no result. */
  | 'notRecorded'
  /** A result was sent for the dog, and the dog has no result or did not run any more. */
  | 'sentGone'

export interface KcDogReport {
  /** A foreign dog Kennelliitto does not know: sending adds it there first, as a dog of this country (KOE-1201). */
  createsDog?: KcDogCountry
  /** What Kennelliitto answered when the last call was refused. */
  errors?: string[]
  id: string
  /**
   * Kennelliitto knows the dog under another number (KOE-1653): the result is sent only after the
   * secretary chose what to do with it.
   */
  kcDog?: KcKnownDog
  eventClass?: string
  name: string
  problems: KcProblem[]
  regNo: string
  status: KcDogStatus
  tulosId?: number
}

export type KcBlockerCode =
  | 'notOfficial'
  | 'noKcGuid'
  | 'kcGuidChoose'
  | 'kcGuidConflict'
  | 'kcUnavailable'
  | 'koemuotoMismatch'
  | 'stateNotWritable'
  | 'handedOver'

/** What stops the whole trial from being sent. */
export interface KcBlocker {
  code: KcBlockerCode
  detail?: string
  virheet?: string[]
}

export type KcSendOutcome = 'sent' | 'failed' | 'skipped' | 'unchanged'

export interface KcSendReport {
  /**
   * What Kennelliitto answered could not be stored here (a `failed` outcome): the dog's stored state is
   * as it was, so it reads as unsent and sending it again updates what Kennelliitto holds.
   */
  answerNotStored?: true
  /** Kennelliitto did not add the foreign dog, so no result was sent for it (KOE-1201). */
  dogNotAdded?: true
  /** Where a dog that was asked for and not sent stood, and why (a `skipped` outcome). */
  dogStatus?: KcDogStatus
  errors?: string[]
  id: string
  name: string
  outcome: KcSendOutcome
  problems?: KcProblem[]
  regNo: string
  /** The status Kennelliitto answered with, for a call it refused without giving reasons. */
  status?: number
  tulosId?: number
}

export interface KcPreviewResponse {
  blockers: KcBlocker[]
  dogs: KcDogReport[]
  state?: { code: number; name: string }
}

export interface KcSendResponse {
  blockers: KcBlocker[]
  /** Dogs the request had no time left for: ask for them again. */
  notAttempted: string[]
  /**
   * What changed on the registrations, one patch per dog: what its sending came to (`kcResult`), and the
   * registration number taken from Kennelliitto (`dog`, KOE-1653). The open pages get the same patches.
   */
  patches: Patch<JsonRegistration>[]
  reports: KcSendReport[]
}

/** What the page shows of a dog's result beside the dog, from the registration alone. */
export type KcResultBadge = 'changed' | 'failed' | 'sent' | 'unsent'

/**
 * Where a dog's result stands with Kennelliitto, as far as the stored registration says. A result
 * edited after it was sent, and one sent without knowing what Kennelliitto holds, both want sending
 * again; the preview, which also sees the content, has the last word.
 */
export const kcResultBadge = (registration: {
  eventResult?: { result?: string; updatedAt: Date | string }
  kcResult?: { payloadHash?: string; resultVersion?: string; status: JsonKcResult['status'] }
}): KcResultBadge | undefined => {
  const { eventResult, kcResult } = registration
  if (kcResult?.status === 'failed') return 'failed'
  if (kcResult?.status === 'sent') {
    const current =
      !eventResult ||
      kcResult.resultVersion === undefined ||
      new Date(kcResult.resultVersion).getTime() === new Date(eventResult.updatedAt).getTime()
    return kcResult.payloadHash !== undefined && current ? 'sent' : 'changed'
  }
  return eventResult?.result ? 'unsent' : undefined
}
