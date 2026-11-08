import type { StartListTeamDay } from '../../lib/startList'
import type { DayKey } from '../../types/Day'
import type { PublicRegistration } from '../../types/Registration'
import Box from '@mui/material/Box'
import TableCell from '@mui/material/TableCell'
import { useTranslation } from 'react-i18next'
import { teamRowPrefix } from '../../lib/startList'
import { DateHeader } from './DateHeader'
import { RegistrationDetails } from './RegistrationDetails'
import { StyledTableRow } from './StyledTableRow'

interface TeamHeaderProps {
  readonly title?: string
  readonly name?: string
}

/** A team's heading: "Joukkue 1", and its name under it in bold. The dogs in no team have only a name. */
const TeamHeader = ({ title, name }: TeamHeaderProps) => (
  <StyledTableRow>
    <TableCell colSpan={6} sx={{ pt: 2 }}>
      {title && <Box sx={{ fontWeight: 500 }}>{title}</Box>}
      {name && <Box sx={{ fontWeight: 'bold' }}>{name}</Box>}
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
  readonly warnNumberPending: (registration: PublicRegistration, date: DayKey) => boolean
}

/**
 * The start list by team (KOE-1715): under each day its teams, each with its number, its name and its
 * dogs in letter order, then the dogs in no team. The rows are the running order's own, the code in
 * front of the number.
 */
export const TeamStartList = ({ days, warnNumberPending }: TeamStartListProps) => {
  const { t } = useTranslation()

  return days.map(({ date, noTeam, showClass, teams }) => [
    <DateHeader key={date} date={date} />,
    ...teams.flatMap((team) => [
      <TeamHeader
        key={`team-${date}-${team.number}`}
        name={team.name}
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
  ])
}
