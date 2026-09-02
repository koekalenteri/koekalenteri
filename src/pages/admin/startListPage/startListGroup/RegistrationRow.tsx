import type { Registration } from '../../../../types'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Tooltip from '@mui/material/Tooltip'
import { useTranslation } from 'react-i18next'
import { breedAbbreviation } from '../../../../lib/dog'
import { formatOwnerNames, getRegistrationOwners } from '../../../../lib/registration'

interface RegistrationRowProps {
  reg: Registration
  reserve: boolean
  nameLen: number
  /** The class's draw has begun, but this dog's number is still the working order (KOE-1287). */
  numberPending?: boolean
}

const RegistrationRow = ({ reg, reserve, nameLen, numberPending }: RegistrationRowProps) => {
  const { t } = useTranslation()
  const owners = getRegistrationOwners(reg)
  // The entered or frozen number is the dog's own; the working order only fills in before the draw.
  const number = reg.startGroup?.number ?? reg.group?.number

  return (
    <TableRow key={reg.id}>
      <TableCell>
        {numberPending && (
          <Tooltip title={t('startList.numberPending')}>
            <WarningAmberOutlined color="warning" sx={{ fontSize: '1rem', mr: 0.25, verticalAlign: 'text-top' }} />
          </Tooltip>
        )}
        {number?.toString().padStart(5)}
      </TableCell>
      <TableCell>{reg.dog.regNo}</TableCell>
      <TableCell>{t('dateFormat.isodate', { date: reg.dog.dob })}</TableCell>
      <TableCell>{reg.dog.rfid}</TableCell>
      <TableCell>{breedAbbreviation(t, reg.dog.breedCode, reg.dog.gender)}</TableCell>
      <TableCell>{reg.dog.name?.slice(0, nameLen).padEnd(nameLen) ?? ''}</TableCell>
      <TableCell>{formatOwnerNames(reg)}</TableCell>
      <TableCell align="center">{owners.some((owner) => owner?.membership) ? '✘' : ''}</TableCell>
      <TableCell>{reg.handler?.name}</TableCell>
      <TableCell align="center">{reg.handler?.membership ? '✘' : ''}</TableCell>
      <TableCell>{reg.handler?.phone ?? t('startList.noPhone')}</TableCell>
      {reserve ? (
        <>
          <TableCell>{reg.handler?.location}</TableCell>
          <TableCell>{reg.reserve ? t(`registration.reserveChoises.${reg.reserve}`) : ''}</TableCell>
        </>
      ) : null}
    </TableRow>
  )
}

export default RegistrationRow
