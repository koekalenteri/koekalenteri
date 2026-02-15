import type { Registration, RegistrationTime } from '../../../types'

import { useTranslation } from 'react-i18next'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'

import HeaderRow from './startListGroup/HeaderRow'
import RegistrationRow from './startListGroup/RegistrationRow'

interface Props {
  eventClass: string
  colSpan: number
  group: Record<string, Record<string, Registration[]>>
  heading: string
  nameLen: number
  reserve: boolean
  time: RegistrationTime
}

const StartListGroup = ({ colSpan, group, heading, eventClass, time, reserve, nameLen }: Props) => {
  const { t } = useTranslation()

  return (
    <>
      <TableRow>
        <TableCell colSpan={colSpan}>
          <Typography variant="h6">{eventClass + (time ? ' - ' + t(`registration.timeLong.${time}`) : '')}</Typography>
        </TableCell>
      </TableRow>
      <HeaderRow key={`${heading}${eventClass}header`} reserve={reserve} />
      {group[eventClass][time].map((reg) => (
        <RegistrationRow key={reg.id} reg={reg} reserve={reserve} nameLen={nameLen} />
      ))}
    </>
  )
}

export default StartListGroup
