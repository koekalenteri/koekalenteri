import type { PaymentStatusKey } from '../../lib/payment'
import type { PublicDogEvent, Registration } from '../../types'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import PersonOutline from '@mui/icons-material/PersonOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { formatMoney } from '../../lib/money'
import { getShownPayment, isPaidStatus, isPaymentOffered } from '../../lib/payment'
import { hasPriority } from '../../lib/registration'
import { Path } from '../../routeConfig'

const priorityIconColor = (event: PublicDogEvent, registration: Registration) =>
  hasPriority(event, registration) ? 'primary.main' : 'transparent'

const priorityStatus = (event: PublicDogEvent, registration: Registration) =>
  hasPriority(event, registration) ? 'registration.priority.hasPriority' : 'registration.priority.noPriority'

/** The euro sign says what the line beside it says: a fee that went back is not paid (KOE-1526). */
const paymentIconColor = (status: PaymentStatusKey) => (isPaidStatus(status) ? 'primary.main' : 'transparent')

const registrationStatus = (registration: Registration) => {
  if (registration.cancelled) {
    return 'registration.status.cancelled'
  }
  if (registration.messagesSent?.picked && !registration.confirmed) {
    return 'registration.status.placeOffered'
  }
  if (registration.invitationRead) {
    return registration.confirmed
      ? 'registration.status.confirmedAndInvitationRead'
      : 'registration.status.invitationRead'
  }
  return registration.confirmed ? 'registration.status.confirmed' : 'registration.status.received'
}

interface Props {
  event: PublicDogEvent
  registration: Registration
  onConfirm: () => void
  paymentVerificationInProgress?: boolean
}

export const InfoBox = ({ event, registration, onConfirm, paymentVerificationInProgress = false }: Props) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const needsConfirmation = !registration.cancelled && !registration.confirmed && !!registration.messagesSent?.picked
  const needsPayment = isPaymentOffered(registration, paymentVerificationInProgress)
  // A paid place reads as paid until its fee rises above what was paid (KOE-722): then the line
  // names the missing part, the same amount the payment button collects. For a fee that went back the
  // server decides it, as only it knows whether the reserve has a place (getParticipantPaymentDue,
  // KOE-1526).
  const { due: paymentDue, status: paymentStatus } = getShownPayment(event, registration)
  const paymentStatusText = paymentVerificationInProgress
    ? t('registration.notifications.paymentVerifying')
    : t(paymentStatus, { amount: formatMoney(paymentDue) })

  return (
    <Paper sx={{ bgcolor: 'background.selected', m: 1, p: 1 }}>
      <List disablePadding>
        <ListItem disablePadding>
          <ListItemIcon sx={{ color: priorityIconColor(event, registration), minWidth: 32 }}>
            <PersonOutline fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={t(priorityStatus(event, registration))}
            slotProps={{ primary: { sx: { fontWeight: 'bold' }, variant: 'subtitle1' } }}
          />
        </ListItem>
        <ListItem
          disablePadding
          secondaryAction={
            needsPayment ? (
              <Button
                aria-label={t('registration.cta.pay')}
                onClick={() => navigate(Path.payment(registration))}
                size="small"
                variant="contained"
              >
                {t('registration.cta.pay')}
              </Button>
            ) : null
          }
        >
          <ListItemIcon sx={{ color: paymentIconColor(paymentStatus), minWidth: 32 }}>
            <EuroOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={
              registration.totalAmount ? `${paymentStatusText} (${registration.totalAmount}€)` : paymentStatusText
            }
            slotProps={{ primary: { sx: { fontWeight: 'bold' }, variant: 'subtitle1' } }}
            sx={{ pr: needsPayment ? 12 : 0 }}
          />
        </ListItem>
        <ListItem disablePadding sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <ListItemIcon sx={{ color: 'primary.main', minWidth: 32 }}>
            <CheckOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={t(registrationStatus(registration))}
            slotProps={{ primary: { sx: { fontWeight: 'bold' }, variant: 'subtitle1' } }}
            sx={{ minWidth: 0, mr: { sm: 1 } }}
          />
          {needsConfirmation ? (
            <Box
              sx={{ flexBasis: { sm: 'auto', xs: 'calc(100% - 32px)' }, ml: { sm: 0, xs: 4 }, mt: { sm: 0, xs: 1 } }}
            >
              <Button
                aria-label={t('registration.confirmDialog.cta')}
                onClick={onConfirm}
                size="small"
                sx={{ width: { sm: 'auto', xs: '100%' } }}
                variant="contained"
              >
                {t('registration.confirmDialog.cta')}
              </Button>
            </Box>
          ) : null}
        </ListItem>
      </List>
    </Paper>
  )
}
