import type { Registration, RegistrationTime } from '../../types'

import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { TableBody } from '@aws-amplify/ui-react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useRecoilValue } from 'recoil'

import { keysOf } from '../../lib/typeGuards'
import { hasAdminAccessSelector, useUserActions } from '../recoil'

import StartListGroup from './startListPage/StartListGroup'
import { adminEventRegistrationsAtom } from './recoil'

type GroupedRegs = Record<string | number, Record<string, Record<RegistrationTime, Registration[]>>>

export default function StartListPage() {
  const { t } = useTranslation()
  const actions = useUserActions()
  const hasAccess = useRecoilValue(hasAdminAccessSelector)
  const params = useParams()
  const eventId = params.id ?? ''
  const allRegistrations = useRecoilValue(adminEventRegistrationsAtom(eventId))
  const regsToPrint = allRegistrations.filter((reg) => !reg.cancelled)
  const nameLen = regsToPrint.reduce((acc, reg) => Math.min(38, Math.max(acc, reg.dog.name?.length ?? 0)), 0)
  const grouped = regsToPrint.reduce<GroupedRegs>((acc, reg) => {
    const date = reg.group?.date ? `${reg.group.date.valueOf()}` : 'varalla'
    const eventClass = reg.class ?? reg.eventType ?? ''
    const time: RegistrationTime = reg.group?.time ?? 'kp'
    acc[date] = acc[date] ?? {}
    acc[date][eventClass] = acc[date][eventClass] ?? {}
    acc[date][eventClass][time] = acc[date][eventClass][time] ?? []
    acc[date][eventClass][time].push(reg)
    return acc
  }, {})
  const groupKeys = Object.keys(grouped)
  groupKeys.sort((a, b) => a.localeCompare(b))

  useEffect(() => {
    if (!hasAccess) actions.login()
  }, [actions, hasAccess])

  if (!hasAccess) return null

  return (
    <Box p={1}>
      <TableContainer component={Paper}>
        {groupKeys.map((groupKey) => {
          const reserve = groupKey === 'varalla'
          const cols = reserve ? 10 : 8
          const group = grouped[groupKey]
          const heading = reserve ? groupKey : t('dateFormat.wdshort', { date: new Date(+groupKey) })

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
