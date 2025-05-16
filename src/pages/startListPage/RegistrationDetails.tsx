import type { PublicRegistration } from '../../types/Registration'

import { useTranslation } from 'react-i18next'
import TableCell from '@mui/material/TableCell'

import { StyledTableRow } from './StyledTableRow'

interface RegistrationDetailsProps {
  registration: PublicRegistration
  index: number
}

export const RegistrationDetails = ({ registration: reg, index }: RegistrationDetailsProps) => {
  const { t } = useTranslation()

  return (
    <>
      <StyledTableRow key={`${reg.group.number}-a`} className={index > 0 ? 'top-border' : ''}>
        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
          {reg.group.number}.
        </TableCell>
        <TableCell>
          {reg.dog.breedCode && reg.dog.gender
            ? t(`${reg.dog.breedCode}.${reg.dog.gender}`, {
                ns: 'breedAbbr',
                defaultValue: reg.dog.breedCode,
              })
            : ''}
        </TableCell>
        <TableCell>{reg.dog.titles}</TableCell>
        <TableCell>{reg.dog.name}</TableCell>
        <TableCell>{reg.dog.regNo}</TableCell>
        <TableCell>s. {reg.dog.dob ? t('dateFormat.date', { date: reg.dog.dob }) : '?'}</TableCell>
      </StyledTableRow>
      <StyledTableRow key={`${reg.group.number}-b`}>
        <TableCell></TableCell>
        <TableCell colSpan={5}>
          (i. {reg.dog.sire?.titles} {reg.dog.sire?.name}, e. {reg.dog.dam?.titles} {reg.dog.dam?.name})
        </TableCell>
      </StyledTableRow>
      <StyledTableRow key={`${reg.group.number}-c`}>
        <TableCell></TableCell>
        <TableCell colSpan={2}>
          {reg.ownerHandles ? 'om. & ohj. ' + reg.owner : 'om. ' + reg.owner + ', ohj. ' + reg.handler}
        </TableCell>
        <TableCell colSpan={2}>kasv. {reg.breeder}</TableCell>
      </StyledTableRow>
    </>
  )
}
