import type { TFunction } from 'i18next'
import type React from 'react'
import type { PublicationNote, StartListTeamDay } from '../../lib/startListView'
import type { DayKey } from '../../types/Day'
import type { EventClass, PublicConfirmedEvent } from '../../types/Event'
import type { PublicRegistration } from '../../types/Registration'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { enqueueSnackbar } from 'notistack'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { reportError } from '../../lib/client/error'
import { downloadXlsx } from '../../lib/client/xlsx'
import { breedAbbreviation, formatDogName } from '../../lib/dog'
import {
  eventRegistrationDateKey,
  isStartListAvailableForClass,
  isStartListAvailableForRegistration,
  isStartNumbersAvailableForClass,
  isStartNumbersAvailableForRegistration,
} from '../../lib/event'
import { startListFileName } from '../../lib/fileName'
import { judgeName } from '../../lib/judge'
import { formatResultLine } from '../../lib/results'
import { startListColumnWidths, startListSpreadsheetRows } from '../../lib/startList'
import {
  formatTeamStanding,
  publicationNote,
  publicationNoteLine,
  rowPublicationNote,
  startListTeamDays,
  teamDayNoteLines,
  teamRowPrefix,
} from '../../lib/startListView'
import { CancelledRegistration } from './CancelledRegistration'
import { ClassHeader } from './ClassHeader'
import { DateHeader } from './DateHeader'
import { RegistrationDetails } from './RegistrationDetails'
import { RotationHeader } from './RotationHeader'
import { TeamStartList } from './TeamStartList'
import { TimeHeader } from './TimeHeader'

interface ParticipantListProps {
  participants: PublicRegistration[]
  event: PublicConfirmedEvent
  includeUnpublished?: boolean
  showExportActions?: boolean
}

type RegistrationItem = { date: DayKey; order: number; registration: PublicRegistration; type: 'registration' }

type StartListItem = RegistrationItem | { date: DayKey; eventClass: EventClass; order: number; type: 'emptyClass' }

/** The two views of a team competition's list (KOE-1715): by team, or the running order. */
type StartListView = 'order' | 'team'

const isRegistrationItem = (item: StartListItem): item is RegistrationItem => item.type === 'registration'

export const ParticipantList = ({
  participants,
  event,
  includeUnpublished = false,
  showExportActions = false,
}: ParticipantListProps) => {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  // A team competition opens by team (KOE-1715); the running order is the other view, not remembered.
  const [view, setView] = useState<StartListView>('team')
  const visibleParticipants = useMemo(
    () => getVisibleStartListParticipants(participants, event, includeUnpublished),
    [event, includeUnpublished, participants]
  )
  const spreadsheetRows = useMemo(
    () => startListSpreadsheetRows(visibleParticipants, event, t),
    [event, t, visibleParticipants]
  )
  const startListItems = useMemo(() => getStartListItems(visibleParticipants, event), [event, visibleParticipants])
  // The team view reads the running order's rows as they are sorted, so both list a day's dogs alike.
  const teamDays = useMemo(() => startListTeamDays(startListItems.filter(isRegistrationItem)), [startListItems])
  // The public event has no teams; a row that carries one is what says the list has them.
  const hasTeams = teamDays.some((day) => day.teams.length > 0)
  const byTeam = hasTeams && view === 'team'
  const copyText = useMemo(
    () => (byTeam ? formatTeamStartList(teamDays, event, t) : formatStartList(visibleParticipants, event, t)),
    [byTeam, event, t, teamDays, visibleParticipants]
  )
  // Preview only (KOE-1218): where a class+day has drawn numbers, an undrawn dog's working-order
  // number can collide with a drawn one — those rows get a warning marker.
  const drawnClassDates = useMemo(() => {
    const keys = new Set<string>()
    for (const reg of participants) {
      if (reg.numberProvisional === false) keys.add(classDateKey(reg.class, reg.group.date ?? event.startDate))
    }
    return keys
  }, [event.startDate, participants])
  const warnNumberPending = (reg: PublicRegistration, date: DayKey) =>
    reg.numberProvisional === true && drawnClassDates.has(classDateKey(reg.class, date))
  let lastDate: DayKey | undefined
  let lastClass: PublicRegistration['class']
  let lastGroup: string | undefined
  let index = 0

  return (
    <>
      {(hasTeams || showExportActions) && (
        <Box sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
          {hasTeams && (
            <ToggleButtonGroup
              aria-label={t('startList.view')}
              color="primary"
              exclusive
              onChange={(_event, next: StartListView | null) => next && setView(next)}
              size="small"
              value={view}
            >
              <ToggleButton value="team">{t('startList.byTeam')}</ToggleButton>
              <ToggleButton value="order">{t('startList.byOrder')}</ToggleButton>
            </ToggleButtonGroup>
          )}
          {showExportActions && (
            <Box sx={{ display: 'flex', gap: 1, ml: 'auto' }}>
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(copyText)
                    setCopied(true)
                  } catch {
                    // A missing clipboard API (insecure context, webview) throws here too.
                    enqueueSnackbar(t('startListCopyFailed'), { variant: 'error' })
                  }
                }}
                size="small"
                startIcon={<ContentCopyOutlined />}
                variant="outlined"
              >
                {copied ? t('startListCopied') : t('copyStartList')}
              </Button>
              <Button
                onClick={() => {
                  downloadXlsx({
                    columnWidths: startListColumnWidths,
                    fileName: startListFileName(event),
                    rows: spreadsheetRows,
                    sheetName: t('startListExport.sheetName'),
                  }).catch(reportError)
                }}
                size="small"
                startIcon={<DownloadOutlined />}
                variant="outlined"
              >
                {t('downloadStartList')}
              </Button>
            </Box>
          )}
        </Box>
      )}
      <Table size="small">
        <TableBody>
          {byTeam ? (
            <TeamStartList days={teamDays} event={event} warnNumberPending={warnNumberPending} />
          ) : (
            startListItems.map((item) => {
              const result: React.JSX.Element[] = []
              const date = item.date

              // Add date header if date changed
              if (startListDateKey(date) !== startListDateKey(lastDate)) {
                result.push(<DateHeader key={date} date={date} />, ...classlessDayNoteRows(event, item))
                lastDate = date
                lastClass = undefined
                lastGroup = undefined
                index = 0
              }

              if (item.type === 'emptyClass') {
                result.push(
                  <ClassHeader
                    key={`empty-${item.eventClass.class}-${item.date}`}
                    classValue={item.eventClass.class}
                    event={event}
                    lastDate={item.date}
                    published={isStartListAvailableForClass(event, item.eventClass)}
                    numbersPublished={isStartNumbersAvailableForClass(event, item.eventClass)}
                  />
                )
                lastClass = item.eventClass.class
                lastGroup = undefined
                index = 0
                return result
              }

              const reg = item.registration

              // Add class header if class changed
              if (lastClass !== reg.class) {
                if (reg.class) {
                  result.push(
                    <ClassHeader
                      key={`${reg.class}-${date}`}
                      classValue={reg.class}
                      event={event}
                      lastDate={lastDate}
                      published={isStartListAvailableForRegistration(event, reg)}
                      numbersPublished={isStartNumbersAvailableForRegistration(event, reg)}
                    />,
                    <RotationHeader
                      classValue={reg.class}
                      date={date}
                      event={event}
                      key={`rotation-${reg.class}-${date}`}
                      numbersPublished={isStartNumbersAvailableForRegistration(event, reg)}
                    />
                  )
                }
                lastClass = reg.class
                index = 0
              }

              // Add time header if time changed
              const group = startListGroupKey(date, reg.group.time)
              if (lastGroup !== group) {
                if (reg.group.time) {
                  result.push(
                    <TimeHeader key={`${lastDate} ${reg.group.time}`} time={reg.group.time} lastDate={lastDate} />
                  )
                }
                lastGroup = group
                index = 0
              }

              // Add registration details
              if (reg.cancelled) {
                result.push(
                  <CancelledRegistration
                    key={`cancelled-${reg.dog.regNo}-${reg.group.number}`}
                    groupNumber={reg.group.number}
                    index={index}
                  />
                )
              } else {
                result.push(
                  <RegistrationDetails
                    key={`reg-${reg.dog.regNo}-${reg.group.number}`}
                    registration={reg}
                    index={index}
                    warnNumberPending={warnNumberPending(reg, date)}
                  />
                )
              }
              index++

              return result
            })
          )}
        </TableBody>
      </Table>
    </>
  )
}

/** A classless day's publication: what the heading is told and the note it makes of it. */
interface DayPublication {
  note: PublicationNote
  numbersPublished: boolean
  published: boolean
}

/**
 * A classless event has no class heading, so its day carries the note, read from the day's first row.
 * Nothing for a day of classes or one whose list and numbers are out.
 */
function classlessDayNote(event: PublicConfirmedEvent, item: StartListItem): DayPublication | undefined {
  if (!isRegistrationItem(item) || item.registration.class) return undefined
  const published = isStartListAvailableForRegistration(event, item.registration)
  const numbersPublished = isStartNumbersAvailableForRegistration(event, item.registration)
  const note = publicationNote(published, numbersPublished)
  return note && { note, numbersPublished, published }
}

/** The classless day's note as a row under the date, or nothing. */
function classlessDayNoteRows(event: PublicConfirmedEvent, item: StartListItem): React.JSX.Element[] {
  const day = classlessDayNote(event, item)
  if (!day) return []
  return [
    <ClassHeader
      key={`notes-${item.date}`}
      classValue=""
      event={event}
      lastDate={item.date}
      published={day.published}
      numbersPublished={day.numbersPublished}
    />,
  ]
}

/** A class's line in the copied list: the class, its judges and its note. */
function classLine(classValue: string, judges: string, note: PublicationNote | undefined, t: TFunction) {
  return [classValue, judges, note && `(${t(note)})`].filter(Boolean).join(' ')
}

function formatStartList(participants: PublicRegistration[], event: PublicConfirmedEvent, t: TFunction) {
  let lastDate: DayKey | undefined
  let lastClass: PublicRegistration['class']
  let lastGroup: string | undefined
  const lines: string[] = []

  getStartListItems(participants, event).forEach((item) => {
    const date = item.date
    if (startListDateKey(date) !== startListDateKey(lastDate)) {
      if (lines.length) lines.push('')
      lines.push(`${t('dateFormat.weekday', { date })} ${t('dateFormat.date', { date })}`)
      // The classless event's notes, mirroring the on-screen list's date-level placement.
      const dayNote = classlessDayNote(event, item)
      if (dayNote) lines.push(publicationNoteLine('', dayNote.note, t))
      lastDate = date
      lastClass = undefined
      lastGroup = undefined
    }

    if (item.type === 'emptyClass') {
      const judges = formatClassJudges(event, item.eventClass.class, item.date, t)
      // A class the list shows only as a heading: its note by the same rule as the heading on screen.
      const note = publicationNote(
        isStartListAvailableForClass(event, item.eventClass),
        isStartNumbersAvailableForClass(event, item.eventClass)
      )
      lines.push(classLine(item.eventClass.class, judges, note, t))
      lastClass = item.eventClass.class
      lastGroup = undefined
      return
    }

    const reg = item.registration

    if (lastClass !== reg.class) {
      if (reg.class) {
        lines.push(
          classLine(reg.class, formatClassJudges(event, reg.class, date, t), rowPublicationNote(event, reg), t)
        )
      }
      lastClass = reg.class
    }

    const group = startListGroupKey(date, reg.group.time)
    if (lastGroup !== group) {
      if (reg.group.time) lines.push(t(`registration.timeLong.${reg.group.time}`))
      lastGroup = group
    }

    lines.push(formatRegistration(reg, t))
  })

  return lines.join('\n')
}

function getStartListItems(participants: PublicRegistration[], event: PublicConfirmedEvent): StartListItem[] {
  const participantClassDates = new Set(
    participants.map((reg) => classDateKey(reg.class, reg.group.date ?? event.startDate))
  )
  const includedClasses = new Set<string>()
  const registrations = participants.map<StartListItem>((registration, order) => ({
    date: registration.group.date ?? event.startDate,
    order,
    registration,
    type: 'registration',
  }))
  const emptyClasses = event.classes.flatMap<StartListItem>((eventClass, order) => {
    const date = eventClass.date ?? event.startDate
    const key = classDateKey(eventClass.class, date)
    // Keep unpublished classes visible as headers on a partially published public start list.
    // Their registrations are filtered out above, so no groups or participant details are shown.
    if (includedClasses.has(key) || participantClassDates.has(key)) {
      return []
    }
    includedClasses.add(key)
    return [{ date, eventClass, order: participants.length + order, type: 'emptyClass' }]
  })

  return registrations.concat(emptyClasses).sort((a, b) => {
    const dateDiff = startListDateKey(a.date).localeCompare(startListDateKey(b.date))
    if (dateDiff) return dateDiff

    const classDiff = startListItemClass(a).localeCompare(startListItemClass(b))
    if (classDiff) return classDiff

    const timeDiff = startListItemTime(a).localeCompare(startListItemTime(b))
    if (timeDiff) return timeDiff

    const numberDiff = startListItemNumber(a) - startListItemNumber(b)
    return numberDiff || a.order - b.order
  })
}

function getVisibleStartListParticipants(
  participants: PublicRegistration[],
  event: PublicConfirmedEvent,
  includeUnpublished: boolean
): PublicRegistration[] {
  if (includeUnpublished) return participants
  return participants.filter((registration) => isStartListAvailableForRegistration(event, registration))
}

function startListItemClass(item: StartListItem): string {
  return item.type === 'emptyClass' ? item.eventClass.class : (item.registration.class ?? '')
}

function startListItemTime(item: StartListItem): string {
  return item.type === 'registration' ? startListGroupKey(item.date, item.registration.group.time) : ''
}

function startListItemNumber(item: StartListItem): number {
  return item.type === 'registration'
    ? (item.registration.group.number ?? Number.MAX_SAFE_INTEGER)
    : Number.MAX_SAFE_INTEGER
}

function classDateKey(classValue: string | null | undefined, date: DayKey | undefined): string {
  return `${classValue ?? ''}:${startListDateKey(date)}`
}

function startListDateKey(date: DayKey | undefined): string {
  return date ?? ''
}

function startListGroupKey(date: DayKey, time: PublicRegistration['group']['time']): string {
  return time ? eventRegistrationDateKey({ date, time }) : startListDateKey(date)
}

function formatClassJudges(event: PublicConfirmedEvent, eventClass: string, date: DayKey | undefined, t: TFunction) {
  return event.classes
    .filter((c) => c.class === eventClass && startListDateKey(c.date) === startListDateKey(date))
    .map((c) => (Array.isArray(c.judge) ? c.judge.map((j) => judgeName(j, t)).join(', ') : judgeName(c.judge, t)))
    .filter(Boolean)
    .join(', ')
}

/** The copied list by team (KOE-1715), read from the same days as the screen shows. */
function formatTeamStartList(days: readonly StartListTeamDay[], event: PublicConfirmedEvent, t: TFunction) {
  const lines: string[] = []
  const group = (heading: string[], rows: readonly PublicRegistration[], showClass: boolean) => {
    lines.push('', ...heading, ...rows.map((reg) => formatRegistration(reg, t, teamRowPrefix(reg, showClass))))
  }

  days.forEach((day) => {
    const { date, noTeam, showClass, teams } = day
    if (lines.length) lines.push('')
    lines.push(
      `${t('dateFormat.weekday', { date })} ${t('dateFormat.date', { date })}`,
      ...teamDayNoteLines(event, day, t)
    )
    for (const team of teams) {
      const standing = formatTeamStanding(team, t)
      const heading = [t('startList.team', { number: team.number }), team.name, standing].filter(
        (line): line is string => !!line
      )
      group(heading, team.rows, showClass)
    }
    if (noTeam.length) group([t('startList.noTeam')], noTeam, showClass)
  })

  return lines.join('\n')
}

function formatRegistration(reg: PublicRegistration, t: TFunction, prefix = '') {
  if (reg.cancelled) return `${reg.group.number}. ${t('startList.absent')}`

  const breed = breedAbbreviation(t, reg.dog.breedCode, reg.dog.gender)
  const ownerHandler = reg.ownerHandles
    ? `${t('startList.ownerAndHandler')} ${reg.owner}`
    : `${t('startList.owner')} ${reg.owner}, ${t('startList.handler')} ${reg.handler}`
  const dog = [breed, reg.dog.titles, reg.dog.name, reg.dog.regNo].filter(Boolean).join(' ')
  const sire = formatDogName(reg.dog.sire)
  const dam = formatDogName(reg.dog.dam)
  // A withheld number leaves the row unnumbered rather than lying about the order.
  const number = reg.group.number != null ? `${reg.group.number}. ` : ''
  const numberPrefix = prefix ? `${prefix} ${number}` : number

  return [
    `${numberPrefix}${dog} ${t('startList.born')} ${reg.dog.dob ? t('dateFormat.date', { date: reg.dog.dob }) : '?'}`,
    `(${t('startList.sire')} ${sire}, ${t('startList.dam')} ${dam})`,
    `${ownerHandler}, ${t('startList.breeder')} ${reg.breeder}`,
    // The copied list is the one that gets pasted into a forum post, so it has to carry what the
    // screen shows. Leaving the result out here is how the two quietly stop matching.
    formatResultLine(reg, t),
  ]
    .filter(Boolean)
    .join('\n')
}
