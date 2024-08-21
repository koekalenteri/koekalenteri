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

import { hasAdminAccessSelector, useUserActions } from '../recoil'

import { adminEventRegistrationsAtom } from './recoil'

type GroupedRegs = Record<string | number, Record<string, Record<string, Registration[]>>>

interface RowProps {
  c: string
  cols: number
  group: Record<string, Record<string, Registration[]>>
  heading: string
  nameLen: number
  reserve: boolean
  tm: string
}

interface HeaderRowProps {
  reserve: boolean
}
interface RegistrationRowProps {
  reg: Registration
  reserve: boolean
  nameLen: number
}

const HeaderRow = ({ reserve }: HeaderRowProps) => {
  return (
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
  )
}

const RegistrationRow = ({ reg, reserve, nameLen }: RegistrationRowProps) => {
  const { t } = useTranslation()

  return (
    <TableRow key={reg.id}>
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
          <TableCell>{reg.reserve ? t(`registration.reserveChoises.${reg.reserve}`) : ''}</TableCell>
        </>
      ) : null}
    </TableRow>
  )
}

const Row = ({ cols, group, heading, c, tm, reserve, nameLen }: RowProps) => {
  const { t } = useTranslation()

  return (
    <>
      <TableRow key={`${heading} ${c}`}>
        <TableCell colSpan={cols}>
          <Typography variant="h6">
            {c + (tm ? ' - ' + t(`registration.timeLong.${tm as RegistrationTime}`) : '')}
          </Typography>
        </TableCell>
      </TableRow>
      <HeaderRow key={`${heading}${c}header`} reserve={reserve} />
      {group[c][tm].map((reg) => (
        <RegistrationRow key={reg.id} reg={reg} reserve={reserve} nameLen={nameLen} />
      ))}
    </>
  )
}

export default function AdminStartListPage() {
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
    /*t('dateFormat.wdshort', { date: reg.group.date })*/
    const cls = reg.class ?? reg.eventType ?? ''
    const time = reg.group?.time ?? ''
    acc[date] = acc[date] ?? {}
    acc[date][cls] = acc[date][cls] ?? {}
    acc[date][cls][time] = acc[date][cls][time] ?? []
    acc[date][cls][time].push(reg)
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
                {Object.keys(group).map((c) =>
                  Object.keys(group[c]).map((tm) => (
                    <Row
                      key={`${heading} ${c} ${tm}`}
                      c={c}
                      cols={cols}
                      group={group}
                      heading={heading}
                      nameLen={nameLen}
                      reserve={reserve}
                      tm={tm}
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
