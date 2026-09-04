import type { Registration, RegistrationTime } from '../../types'
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
import { hasSharedReserveList } from '../../lib/event'
import {
  getRegistrationClass,
  getRegistrationGroupTime,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { keysOf } from '../../lib/typeGuards'
import { hasAdminAccessAtom, useUserActions } from '../state'
import StartListGroup from './startListPage/StartListGroup'
import { adminEventRegistrationsAtom } from './state'

type GroupedRegs = Record<string | number, Record<string, Record<RegistrationTime, Registration[]>>>

const RESERVE_KEY = 'varalla'
/**
 * Class key of a WT trial's shared reserve list (KOE-912): one list for the whole trial, so it runs
 * in reserve-number order and names each dog's class on its own row instead of splitting by class.
 */
const SHARED_RESERVE_CLASS = '*'

export default function StartListPage() {
  const { t } = useTranslation()
  const actions = useUserActions()
  const hasAccess = useAtomValue(hasAdminAccessAtom)
  const params = useParams()
  const eventId = params.id ?? ''
  const allRegistrations = useAtomValue(adminEventRegistrationsAtom(eventId))
  const regsToPrint = allRegistrations.filter((reg) => !reg.cancelled).sort(sortRegistrationsByDateClassTimeAndNumber)
  const nameLen = regsToPrint.reduce((acc, reg) => Math.min(38, Math.max(acc, reg.dog.name?.length ?? 0)), 0)
  const grouped = regsToPrint.reduce<GroupedRegs>((acc, reg) => {
    const date = reg.group?.date ? `${reg.group.date.valueOf()}` : RESERVE_KEY
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
    return Number(a) - Number(b)
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
      <TableContainer component={Paper}>
        {groupKeys.map((groupKey) => {
          const reserve = groupKey === RESERVE_KEY
          const cols = reserve ? 10 : 8
          const group = grouped[groupKey]
          const heading = reserve ? t('startList.reserve') : t('dateFormat.wdshort', { date: new Date(+groupKey) })

          return (
            <Table key={groupKey} size="small">
              <TableBody>
                <TableRow>
                  <TableCell colSpan={9}>
                    <Typography variant="h5">{heading}</Typography>
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
