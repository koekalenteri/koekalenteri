import type { Registration, RegistrationTime } from '../../types'

import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useParams } from 'react-router-dom'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useRecoilValue } from 'recoil'

import { Path } from '../../routeConfig'
import { hasAdminAccessSelector } from '../recoil'

import { eventRegistrationsAtom } from './recoil'

type GroupedRegs = Record<string, Record<string, Record<string, Registration[]>>>

export default function AdminStartListPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const hasAccess = useRecoilValue(hasAdminAccessSelector)
  const params = useParams()
  const eventId = params.id ?? ''
  const allRegistrations = useRecoilValue(eventRegistrationsAtom(eventId))
  const regsToPrint = allRegistrations.filter((reg) => !reg.cancelled)
  const nameLen = regsToPrint.reduce((acc, reg) => Math.min(38, Math.max(acc, reg.dog.name?.length ?? 0)), 0)
  const grouped = regsToPrint.reduce<GroupedRegs>((acc, reg) => {
    const date = reg.group?.date ? t('dateFormat.wdshort', { date: reg.group.date }) : 'varalla'
    const cls = reg.class ?? reg.eventType ?? ''
    const time = reg.group?.time ?? ''
    acc[date] = acc[date] ?? []
    acc[date][cls] = acc[date][cls] ?? []
    acc[date][cls][time] = acc[date][cls][time] ?? []
    acc[date][cls][time].push(reg)
    return acc
  }, {})
  const dates = Object.keys(grouped)
  dates.sort((a, b) => a.localeCompare(b))

  if (!hasAccess) {
    return <Navigate to={Path.login} state={{ from: location }} replace />
  }

  return (
    <Box p={1}>
      <TableContainer component={Paper}>
        {dates.map((d) => (
          <Table size="small">
            <TableRow>
              <TableCell colSpan={9}>
                <Typography variant="h5">{d}</Typography>
              </TableCell>
            </TableRow>
            {Object.keys(grouped[d]).map((c) => {
              const reserve = d === 'varalla'
              const cols = reserve ? 10 : 8
              return (
                <>
                  {Object.keys(grouped[d][c]).map((tm) => (
                    <>
                      <TableRow>
                        <TableCell colSpan={cols}>
                          <Typography variant="h6">
                            {c + (tm ? ' - ' + t(`registration.timeLong.${tm as RegistrationTime}`) : '')}
                          </Typography>
                        </TableCell>
                      </TableRow>
                      <TableRow selected>
                        <TableCell>#</TableCell>
                        <TableCell>Rotu</TableCell>
                        <TableCell>Nimi</TableCell>
                        <TableCell>Rekisterinumero</TableCell>
                        <TableCell>Syntymäaika</TableCell>
                        <TableCell>Siru</TableCell>
                        <TableCell>Ohjaaja</TableCell>
                        <TableCell>Puhelin</TableCell>
                        {reserve ? (
                          <>
                            <TableCell>Paikkakunta</TableCell>
                            <TableCell>Varoitusaika</TableCell>
                          </>
                        ) : null}
                      </TableRow>
                      {grouped[d][c][tm].map((reg) => (
                        <TableRow>
                          <TableCell>{reg.group?.number.toString().padStart(5)}</TableCell>
                          <TableCell>
                            {reg.dog.breedCode && reg.dog.gender
                              ? t(`${reg.dog.breedCode}.${reg.dog.gender}`, {
                                  ns: 'breedAbbr',
                                  defaultValue: reg.dog.breedCode,
                                })
                              : ''}
                          </TableCell>
                          <TableCell>{reg.dog.name?.slice(0, nameLen).padEnd(nameLen) ?? ''}</TableCell>
                          <TableCell>{reg.dog.regNo}</TableCell>
                          <TableCell>{t('dateFormat.isodate', { date: reg.dog.dob })}</TableCell>
                          <TableCell>{reg.dog.rfid}</TableCell>
                          <TableCell>{reg.handler.name}</TableCell>
                          <TableCell>{reg.handler.phone ?? '-ei puhelinta-'}</TableCell>
                          {reserve ? (
                            <>
                              <TableCell>{reg.handler.location}</TableCell>
                              <TableCell>
                                {reg.reserve ? t(`registration.reserveChoises.${reg.reserve}`) : ''}
                              </TableCell>
                            </>
                          ) : null}
                        </TableRow>
                      ))}
                    </>
                  ))}
                </>
              )
            })}
          </Table>
        ))}
      </TableContainer>
    </Box>
  )
}
