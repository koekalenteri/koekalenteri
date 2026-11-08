import type { TFunction } from 'i18next'
import type { StartListTeamDay } from '../../lib/startListView'
import type { DayKey } from '../../types/Day'
import type { PublicConfirmedEvent } from '../../types/Event'
import type { PublicRegistration } from '../../types/Registration'
import Box from '@mui/material/Box'
import TableCell from '@mui/material/TableCell'
import { useTranslation } from 'react-i18next'
import { formatTeamStanding, teamDayNoteLines, teamRowPrefix } from '../../lib/startListView'
import { DateHeader } from './DateHeader'
import { RegistrationDetails } from './RegistrationDetails'
import { StyledTableRow } from './StyledTableRow'

interface TeamHeaderProps {
  readonly title?: string
  readonly name?: string
  readonly standing?: string
}

/**
 * A team's heading: "Joukkue 1", its name under it in bold, and its standing over the trial once the
 * results are out (KOE-1717), the same under every day the team is shown. The dogs in no team have only a name.
 */
const TeamHeader = ({ title, name, standing }: TeamHeaderProps) => (
  <StyledTableRow>
    <TableCell colSpan={6} sx={{ pt: 2 }}>
      {title && <Box sx={{ fontWeight: 500 }}>{title}</Box>}
      {name && <Box sx={{ fontWeight: 'bold' }}>{name}</Box>}
      {standing && <Box>{standing}</Box>}
    </TableCell>
  </StyledTableRow>
)

interface TeamRowsProps {
  readonly date: DayKey
  readonly rows: readonly PublicRegistration[]
  readonly showClass: boolean
  readonly warnNumberPending: (registration: PublicRegistration, date: DayKey) => boolean
}

const TeamRows = ({ date, rows, showClass, warnNumberPending }: TeamRowsProps) =>
  rows.map((reg, index) => (
    <RegistrationDetails
      key={`reg-${reg.dog.regNo}-${reg.group.number}`}
      index={index}
      registration={reg}
      teamPrefix={teamRowPrefix(reg, showClass)}
      warnNumberPending={warnNumberPending(reg, date)}
    />
  ))

interface TeamStartListProps {
  readonly days: readonly StartListTeamDay[]
  readonly event: PublicConfirmedEvent
  readonly warnNumberPending: (registration: PublicRegistration, date: DayKey) => boolean
}

/**
 * The start list by team (KOE-1715): under each day the notes of its classes whose list or numbers are
 * not out yet, which the running order shows in the class headings, then its teams, each with its
 * number, its name, its standing over the trial (KOE-1717) and its dogs in letter order, then the dogs
 * in no team. The rows are the running order's own, the code in front of the number.
 */
export const TeamStartList = ({ days, event, warnNumberPending }: TeamStartListProps) => {
  const { t } = useTranslation()

  return days.map((day) => [
    <DateHeader key={day.date} date={day.date} />,
    ...teamDayNoteLines(event, day, t).map((line) => (
      <StyledTableRow key={`note-${day.date}-${line}`}>
        <TableCell colSpan={6} sx={{ fontWeight: 'bold' }}>
          {line}
        </TableCell>
      </StyledTableRow>
    )),
    ...teamDayRows(day, t, warnNumberPending),
  ])
}

/** A day's teams and its dogs in no team, each under its heading. */
const teamDayRows = (
  { date, noTeam, showClass, teams }: StartListTeamDay,
  t: TFunction,
  warnNumberPending: TeamStartListProps['warnNumberPending']
) => [
  ...teams.flatMap((team) => [
    <TeamHeader
      key={`team-${date}-${team.number}`}
      name={team.name}
      standing={formatTeamStanding(team, t)}
      title={t('startList.team', { number: team.number })}
    />,
    <TeamRows
      key={`team-rows-${date}-${team.number}`}
      date={date}
      rows={team.rows}
      showClass={showClass}
      warnNumberPending={warnNumberPending}
    />,
  ]),
  ...(noTeam.length
    ? [
        <TeamHeader key={`no-team-${date}`} name={t('startList.noTeam')} />,
        <TeamRows
          key={`no-team-rows-${date}`}
          date={date}
          rows={noTeam}
          showClass={showClass}
          warnNumberPending={warnNumberPending}
        />,
      ]
    : []),
]
