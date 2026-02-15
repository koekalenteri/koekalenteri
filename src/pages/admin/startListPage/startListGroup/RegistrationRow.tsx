import type { Registration } from '../../../../types'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import { useTranslation } from 'react-i18next'

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
      <TableCell>{reg.dog.regNo}</TableCell>
      <TableCell>{t('dateFormat.isodate', { date: reg.dog.dob })}</TableCell>
      <TableCell>{reg.dog.rfid}</TableCell>
      <TableCell>
        {reg.dog.breedCode && reg.dog.gender
          ? t(`${reg.dog.breedCode}.${reg.dog.gender}`, {
              defaultValue: reg.dog.breedCode,
              ns: 'breedAbbr',
            })
          : ''}
      </TableCell>
      <TableCell>{reg.dog.name?.slice(0, nameLen).padEnd(nameLen) ?? ''}</TableCell>
      <TableCell>{reg.owner?.name}</TableCell>
      <TableCell align="center">{reg.owner?.membership ? '✘' : ''}</TableCell>
      <TableCell>{reg.handler?.name}</TableCell>
      <TableCell align="center">{reg.handler?.membership ? '✘' : ''}</TableCell>
      <TableCell>{reg.handler?.phone ?? '-ei puhelinta-'}</TableCell>
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
