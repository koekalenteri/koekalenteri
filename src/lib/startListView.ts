/**
 * How the public start list page arranges its rows: the notes that say a class's list or numbers are
 * not out yet, and the view by team (KOE-1715), series by series (KOE-1720). Kept apart from `startList.ts`, which the API client
 * loads with the first page of the calendar, so that this loads with the start list page alone.
 */
import type { TFunction } from 'i18next'
import type { Language } from '../types'
import type { DayKey } from '../types/Day'
import type { PublicConfirmedEvent, TeamCompetition } from '../types/Event'
import type { PublicRegistration, PublicTeamPlace } from '../types/Registration'
import { isStartListAvailableForRegistration, isStartNumbersAvailableForRegistration } from './event'

/** What a class's heading, or a classless day's, says about its publication: a translation key. */
export type PublicationNote = 'startListNotPublished' | 'startNumbersNotPublished'

/**
 * The one rule for the note: a list not published says so, and a published list whose numbers are not
 * out yet says that the order is not final (KOE-1006). A published list with its numbers has none.
 */
export const publicationNote = (published: boolean, numbersPublished: boolean): PublicationNote | undefined => {
  if (!published) return 'startListNotPublished'
  if (!numbersPublished) return 'startNumbersNotPublished'
  return undefined
}

/** The note for the class and day a row is listed under. */
export const rowPublicationNote = (event: PublicConfirmedEvent, registration: PublicRegistration) =>
  publicationNote(
    isStartListAvailableForRegistration(event, registration),
    isStartNumbersAvailableForRegistration(event, registration)
  )

/** A note as a line of its own: the class it is about, if any, and the note in brackets. */
export const publicationNoteLine = (classValue: string | null | undefined, note: PublicationNote, t: TFunction) =>
  [classValue, `(${t(note)})`].filter(Boolean).join(' ')

/**
 * The notes of a day of the team view (KOE-1715), which has no class headings to carry them: one line
 * for each class the day shows whose list or numbers are not out yet, by the same rule as a heading.
 */
export const teamDayNoteLines = (event: PublicConfirmedEvent, day: StartListTeamDay, t: TFunction): string[] =>
  day.classRows.flatMap((row) => {
    const note = rowPublicationNote(event, row)
    return note ? [publicationNoteLine(row.class, note, t)] : []
  })

/** A row of the start list with the day it is listed under. */
interface StartListDayRow {
  date: DayKey
  registration: PublicRegistration
}

/**
 * One team as a day of the team view shows it: its number, its name, its standing over the trial once
 * it is published (KOE-1717), and its dogs in letter order. The server gives every row of the team the
 * same standing, so the first row's is the team's, and every day shows the same.
 */
interface StartListTeam extends Omit<PublicTeamPlace, 'code'> {
  rows: PublicRegistration[]
}

/**
 * One day of the start list by team (KOE-1715): the teams with a dog on that day's list, in their
 * order, then the dogs in no team. `classRows` is the first row of each class the day shows, in the
 * running order, which the day's publication notes are read from. `showClass` says the day shows dogs
 * of more than one class, so a row names its class in front of its code.
 */
export interface StartListTeamDay {
  classRows: PublicRegistration[]
  date: DayKey
  noTeam: PublicRegistration[]
  showClass: boolean
  teams: StartListTeam[]
}

interface TeamDayDraft {
  classRows: Map<string, PublicRegistration>
  noTeam: PublicRegistration[]
  teams: Map<number, StartListTeam>
}

/** The value under `key`, put there by `make` the first time. */
function entryOf<K, V>(map: Map<K, V>, key: K, make: () => V): V {
  const found = map.get(key)
  if (found !== undefined) return found
  const made = make()
  map.set(key, made)
  return made
}

const letterOrder = (a: PublicRegistration, b: PublicRegistration) =>
  (a.team?.code ?? '').localeCompare(b.team?.code ?? '')

/** What the team view reads of the event: the series of its team competition, which name and order them. */
type SeriesOwner = { teamCompetition?: Pick<TeamCompetition, 'series'> | null }

/**
 * Where a series is in the order of the team view (KOE-1720): the teams in no series first, then each
 * series in the competition's order, and one the competition no longer names after them.
 */
const seriesPlace = (event: SeriesOwner, seriesId: string | undefined): number => {
  if (seriesId === undefined) return -1
  const index = event.teamCompetition?.series?.findIndex(({ id }) => id === seriesId) ?? -1
  return index === -1 ? Number.MAX_SAFE_INTEGER : index
}

function teamDay(date: DayKey, draft: TeamDayDraft, event: SeriesOwner): StartListTeamDay {
  const teams = [...draft.teams.values()].sort(
    (a, b) => seriesPlace(event, a.seriesId) - seriesPlace(event, b.seriesId) || a.number - b.number
  )
  for (const team of teams) team.rows.sort(letterOrder)
  const classRows = [...draft.classRows.values()]
  return { classRows, date, noTeam: draft.noTeam, showClass: classRows.length > 1, teams }
}

/**
 * A team's standing over the trial as the start list and the teams page write it: "1. sija, 170 pistettä",
 * with the run-off named on a team tied for first (KOE-1717). Nothing while the standing is not public.
 */
export const formatTeamStanding = (
  { placement, points, runOff }: Pick<PublicTeamPlace, 'placement' | 'points' | 'runOff'>,
  t: TFunction
): string | undefined => {
  if (placement === undefined || points === undefined) return undefined
  const standing = t('startList.teamStanding', { placement, points })
  return runOff ? `${standing} (${t('startList.teamRunOff')})` : standing
}

/**
 * What a row of the team view names in front of its number: its class where the day shows more than
 * one, then its team code, as in "AVO 1A". Empty for a dog in no team on a day of one class.
 */
export const teamRowPrefix = (registration: PublicRegistration, showClass: boolean): string =>
  [showClass ? registration.class : undefined, registration.team?.code].filter(Boolean).join(' ')

/**
 * The start list by team, from the rows in the running order the list already has: day by day, so a
 * dog of a multi-day trial is under the day it runs. The dogs in no team keep that order. A cancelled
 * dog has no team (KOE-1017) and is left out, and a team none of whose dogs is listed that day is not
 * shown. In a competition in series the teams are listed series by series (`seriesPlace`, KOE-1720).
 */
export function startListTeamDays(rows: readonly StartListDayRow[], event: SeriesOwner = {}): StartListTeamDay[] {
  const days = new Map<DayKey, TeamDayDraft>()
  for (const { date, registration } of rows) {
    if (registration.cancelled) continue
    const day = entryOf(days, date, () => ({ classRows: new Map(), noTeam: [], teams: new Map() }))
    entryOf(day.classRows, registration.class ?? '', () => registration)
    const place = registration.team
    if (place) {
      const { code: _code, ...team } = place
      entryOf(day.teams, place.number, (): StartListTeam => ({ ...team, rows: [] })).rows.push(registration)
    } else {
      day.noTeam.push(registration)
    }
  }

  return [...days].map(([date, draft]) => teamDay(date, draft, event))
}

/**
 * A series as the team view heads it (KOE-1720): its name in the viewer's language, in Finnish where it
 * has none, and its id once the competition no longer names it. The rows carry only the id, so a
 * renamed series needs no new list.
 */
export const teamSeriesName = (event: SeriesOwner, seriesId: string, language: Language): string => {
  const name = event.teamCompetition?.series?.find(({ id }) => id === seriesId)?.name
  return [name?.[language], name?.fi].find((text) => text?.trim()) ?? seriesId
}
