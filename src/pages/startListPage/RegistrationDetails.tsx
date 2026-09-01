import type { PublicRegistration } from '../../types/Registration'
import Box from '@mui/material/Box'
import TableCell from '@mui/material/TableCell'
import { useTranslation } from 'react-i18next'
import { breedAbbreviation, formatDogName } from '../../lib/dog'
import { StyledTableRow } from './StyledTableRow'

interface RegistrationDetailsProps {
  registration: PublicRegistration
  index: number
}

export const RegistrationDetails = ({ registration: reg, index }: RegistrationDetailsProps) => {
  const { t } = useTranslation()
  const breed = breedAbbreviation(t, reg.dog.breedCode, reg.dog.gender)
  const ownerHandler = reg.ownerHandles ? `om. & ohj. ${reg.owner}` : `om. ${reg.owner}, ohj. ${reg.handler}`
  const sire = formatDogName(reg.dog.sire)
  const dam = formatDogName(reg.dog.dam)

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
            {reg.group.number != null ? `${reg.group.number}. ` : ''}
            {[breed, reg.dog.titles, reg.dog.name, reg.dog.regNo].filter(Boolean).join(' ')} s.{' '}
            {reg.dog.dob ? t('dateFormat.date', { date: reg.dog.dob }) : '?'}
          </Box>
          <Box>
            (i. {sire}, e. {dam})
          </Box>
          <Box>
            {ownerHandler}, kasv. {reg.breeder}
          </Box>
          {/* Its own line, bold: this is what a reader came for, and what a Koiranet screenshot omits. */}
          {reg.result && <Box sx={{ fontWeight: 'bold' }}>{reg.result}</Box>}
        </Box>
      </TableCell>
    </StyledTableRow>
  )
}
