import type { PublicRegistration } from '../../types/Registration'
import Box from '@mui/material/Box'
import TableCell from '@mui/material/TableCell'
import { useTranslation } from 'react-i18next'
import { StyledTableRow } from './StyledTableRow'

interface RegistrationDetailsProps {
  registration: PublicRegistration
  index: number
}

export const RegistrationDetails = ({ registration: reg, index }: RegistrationDetailsProps) => {
  const { t } = useTranslation()
  const breed =
    reg.dog.breedCode && reg.dog.gender
      ? t(`${reg.dog.breedCode}.${reg.dog.gender}`, {
          defaultValue: reg.dog.breedCode,
          ns: 'breedAbbr',
        })
      : ''
  const ownerHandler = reg.ownerHandles ? `om. & ohj. ${reg.owner}` : `om. ${reg.owner}, ohj. ${reg.handler}`
  const sire = [reg.dog.sire?.titles, reg.dog.sire?.name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')
  const dam = [reg.dog.dam?.titles, reg.dog.dam?.name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ')

  return (
    <StyledTableRow key={`${reg.group.number}-a`} className={index > 0 ? 'top-border' : ''}>
      <TableCell
        colSpan={6}
        sx={{
          pb: 1.25,
          pt: 1.25,
          whiteSpace: 'normal',
          wordBreak: 'break-word',
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gap: 0.25,
            lineHeight: 1.45,
          }}
        >
          <Box sx={{ fontWeight: 'bold' }}>
            {reg.group.number}. {[breed, reg.dog.titles, reg.dog.name, reg.dog.regNo].filter(Boolean).join(' ')} s.{' '}
            {reg.dog.dob ? t('dateFormat.date', { date: reg.dog.dob }) : '?'}
          </Box>
          <Box>
            (i. {sire}, e. {dam})
          </Box>
          <Box>
            {ownerHandler}, kasv. {reg.breeder}
          </Box>
        </Box>
      </TableCell>
    </StyledTableRow>
  )
}
