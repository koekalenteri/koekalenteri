import type { DogEvent, Language, Registration, RegistrationTime } from '../../types'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { eventTypeLabel, hasSharedReserveList, localizedEventName } from '../../lib/event'
import {
  getRegistrationClass,
  getRegistrationGroupTime,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { keysOf } from '../../lib/typeGuards'
import { HiddenPageTitle } from '../components/HiddenPageTitle'
import { hasAdminAccessAtom, languageAtom, useUserActions } from '../state'
import StartListGroup from './startListPage/StartListGroup'
import { adminEventAtom, adminEventRegistrationsAtom } from './state'
import { useAdminEventScope } from './state/eventScope'

type GroupedRegs = Record<string | number, Record<string, Record<RegistrationTime, Registration[]>>>

const RESERVE_KEY = 'varalla'
/**
 * Class key of a WT trial's shared reserve list (KOE-912): one list for the whole trial, so it runs
 * in reserve-number order and names each dog's class on its own row instead of splitting by class.
 */
const SHARED_RESERVE_CLASS = '*'

/** The trial the list is for, as the public start list names it in its own heading. */
const eventTitle = (event: DogEvent, language: Language) => {
  const name = localizedEventName(event, language)
  const title = `${eventTypeLabel(event)} ${event.location}`
  return name ? `${title} (${name})` : title
}

export default function StartListPage() {
  const { t } = useTranslation()
  const actions = useUserActions()
  const hasAccess = useAtomValue(hasAdminAccessAtom)
  const params = useParams()
  const eventId = params.id ?? ''
  useAdminEventScope(eventId)
  const event = useAtomValue(adminEventAtom(eventId))
  const language = useAtomValue(languageAtom)
  const allRegistrations = useAtomValue(adminEventRegistrationsAtom(eventId))
  const regsToPrint = allRegistrations.filter((reg) => !reg.cancelled).sort(sortRegistrationsByDateClassTimeAndNumber)
  const nameLen = regsToPrint.reduce((acc, reg) => Math.min(38, Math.max(acc, reg.dog.name?.length ?? 0)), 0)
  const grouped = regsToPrint.reduce<GroupedRegs>((acc, reg) => {
    const date = reg.group?.date ?? RESERVE_KEY
    const shared = date === RESERVE_KEY && hasSharedReserveList(reg.eventType)
    const eventClass = shared ? SHARED_RESERVE_CLASS : getRegistrationClass(reg)
    const time = getRegistrationGroupTime(reg)
    acc[date] = acc[date] ?? {}
    acc[date][eventClass] = acc[date][eventClass] ?? {}
    acc[date][eventClass][time] = acc[date][eventClass][time] ?? []
    acc[date][eventClass][time].push(reg)
    return acc
  }, {})
  // The shared list is one queue, so its order is the reserve number rather than class by class.
  for (const regs of Object.values(grouped[RESERVE_KEY]?.[SHARED_RESERVE_CLASS] ?? {})) {
    regs.sort((a, b) => (a.group?.number ?? 0) - (b.group?.number ?? 0))
  }
  const groupKeys = Object.keys(grouped)
  groupKeys.sort((a, b) => {
    if (a === RESERVE_KEY) return 1
    if (b === RESERVE_KEY) return -1
    return a.localeCompare(b)
  })

  useEffect(() => {
    if (!hasAccess) actions.login()
  }, [actions, hasAccess])

  if (!hasAccess) return null

  return (
    <Box
      sx={{
        p: 1,
      }}
    >
      {/* The page's title for a screen reader. The page is printed, and a visible title would add a
          line above the first day on paper (KOE-1506). */}
      <HiddenPageTitle>
        {event ? `${t('startList.title')}: ${eventTitle(event, language)}` : t('startList.title')}
      </HiddenPageTitle>
      <TableContainer component={Paper}>
        {groupKeys.map((groupKey) => {
          const reserve = groupKey === RESERVE_KEY
          const cols = reserve ? 10 : 8
          const group = grouped[groupKey]
          const heading = reserve ? t('startList.reserve') : t('dateFormat.wdshort', { date: groupKey })

          return (
            <Table key={groupKey} size="small">
              <TableBody>
                <TableRow>
                  <TableCell colSpan={9}>
                    <Typography variant="h2">{heading}</Typography>
                  </TableCell>
                </TableRow>
                {Object.keys(group).map((eventClass) =>
                  keysOf(group[eventClass]).map((time) => (
                    <StartListGroup
                      key={`${heading} ${eventClass} ${time}`}
                      eventClass={eventClass}
                      colSpan={cols}
                      group={group}
                      heading={heading}
                      nameLen={nameLen}
                      reserve={reserve}
                      sharedReserve={eventClass === SHARED_RESERVE_CLASS}
                      time={time}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          )
        })}
      </TableContainer>
    </Box>
  )
}
