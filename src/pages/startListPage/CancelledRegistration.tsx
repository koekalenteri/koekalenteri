import Box from '@mui/material/Box'
import TableCell from '@mui/material/TableCell'
import { useTranslation } from 'react-i18next'
import { StyledTableRow } from './StyledTableRow'

interface CancelledRegistrationProps {
  groupNumber?: number
  index?: number
}

// Mirrors the RegistrationDetails row layout so the held number prints in the same
// position — and in the same bold — as the other dogs' numbers (KOE-1017).
export const CancelledRegistration = ({ groupNumber, index = 0 }: CancelledRegistrationProps) => {
  const { t } = useTranslation()

  return (
    <StyledTableRow key={groupNumber} className={index > 0 ? 'top-border' : ''}>
      <TableCell
        colSpan={6}
        sx={{
          pb: 1.25,
          pt: 1.25,
          whiteSpace: 'normal',
          wordBreak: 'break-word',
        }}
      >
        <Box sx={{ fontWeight: 'bold', lineHeight: 1.45 }}>
          {groupNumber != null ? `${groupNumber}. ` : ''}
          {t('startList.absent')}
        </Box>
      </TableCell>
    </StyledTableRow>
  )
}
