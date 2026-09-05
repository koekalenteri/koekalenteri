import type { Registration, RegistrationTime } from '../../../types'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import HeaderRow from './startListGroup/HeaderRow'
import RegistrationRow from './startListGroup/RegistrationRow'

interface Props {
  eventClass: string
  colSpan: number
  group: Record<string, Record<string, Registration[]>>
  heading: string
  nameLen: number
  reserve: boolean
  /** The WT trial's one reserve list (KOE-912): no class heading, each row names its own class. */
  sharedReserve?: boolean
  time: RegistrationTime
}

const StartListGroup = ({ colSpan, group, heading, eventClass, time, reserve, sharedReserve, nameLen }: Props) => {
  const { t } = useTranslation()
  const timeText = time ? t(`registration.timeLong.${time}`) : ''
  // The draw covers the class's whole day, so a dog still on its working-order number is flagged as
  // soon as any dog that day has an entered number (KOE-1287) — same rule as the public preview.
  const hasDrawnNumbers =
    !reserve && Object.values(group[eventClass]).some((regs) => regs.some((reg) => Boolean(reg.startGroup)))

  return (
    <>
      {sharedReserve ? null : (
        <TableRow>
          <TableCell colSpan={colSpan}>
            <Typography variant="h6">{eventClass + (timeText ? ` - ${timeText}` : '')}</Typography>
          </TableCell>
        </TableRow>
      )}
      <HeaderRow key={`${heading}${eventClass}header`} reserve={reserve} showClass={sharedReserve} />
      {group[eventClass][time].map((reg) => (
        <RegistrationRow
          key={reg.id}
          reg={reg}
          reserve={reserve}
          nameLen={nameLen}
          numberPending={hasDrawnNumbers && !reg.startGroup}
          showClass={sharedReserve}
        />
      ))}
    </>
  )
}

export default StartListGroup
