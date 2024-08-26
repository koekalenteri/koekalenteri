import type { Registration } from '../../../../types'

import { useTranslation } from 'react-i18next'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'

interface RegistrationRowProps {
  reg: Registration
  reserve: boolean
  nameLen: number
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

export default RegistrationRow
