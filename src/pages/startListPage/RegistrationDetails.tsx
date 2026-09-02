import type { PublicRegistration } from '../../types/Registration'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import Box from '@mui/material/Box'
import TableCell from '@mui/material/TableCell'
import Tooltip from '@mui/material/Tooltip'
import { useTranslation } from 'react-i18next'
import { breedAbbreviation, formatDogName } from '../../lib/dog'
import { StyledTableRow } from './StyledTableRow'

interface RegistrationDetailsProps {
  registration: PublicRegistration
  index: number
  /** Preview only (KOE-1218): the class has drawn numbers, but this dog's is still the working order. */
  warnNumberPending?: boolean
}

export const RegistrationDetails = ({ registration: reg, index, warnNumberPending }: RegistrationDetailsProps) => {
  const { t } = useTranslation()
  // The preview greys a working-order number the same way the entry view does: only an entered or
  // frozen number reads as the dog's own (KOE-1218).
  const numberSx = reg.numberProvisional ? { color: 'text.secondary', fontWeight: 'normal' } : undefined
  const breed = breedAbbreviation(t, reg.dog.breedCode, reg.dog.gender)
  const ownerHandler = reg.ownerHandles
    ? `${t('startList.ownerAndHandler')} ${reg.owner}`
    : `${t('startList.owner')} ${reg.owner}, ${t('startList.handler')} ${reg.handler}`
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
            {reg.group.number != null && <Box component="span" sx={numberSx}>{`${reg.group.number}. `}</Box>}
            {warnNumberPending && (
              <Tooltip title={t('startList.numberPending')}>
                <WarningAmberOutlined
                  fontSize="inherit"
                  sx={{ color: 'warning.main', mr: 0.5, verticalAlign: 'text-top' }}
                  titleAccess={t('startList.numberPending')}
                />
              </Tooltip>
            )}
            {[breed, reg.dog.titles, reg.dog.name, reg.dog.regNo].filter(Boolean).join(' ')} {t('startList.born')}{' '}
            {reg.dog.dob ? t('dateFormat.date', { date: reg.dog.dob }) : '?'}
          </Box>
          <Box>
            ({t('startList.sire')} {sire}, {t('startList.dam')} {dam})
          </Box>
          <Box>
            {ownerHandler}, {t('startList.breeder')} {reg.breeder}
          </Box>
          {/* Its own line, bold: this is what a reader came for, and what a Koiranet screenshot omits. */}
          {reg.result && <Box sx={{ fontWeight: 'bold' }}>{reg.result}</Box>}
        </Box>
      </TableCell>
    </StyledTableRow>
  )
}
