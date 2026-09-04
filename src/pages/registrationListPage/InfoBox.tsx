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
import { getPaymentStatus } from '../../lib/payment'
import { hasPriority } from '../../lib/registration'
import { Path } from '../../routeConfig'

const priorityIconColor = (event: PublicDogEvent, registration: Registration) =>
  hasPriority(event, registration) ? 'primary.main' : 'transparent'

const priorityStatus = (event: PublicDogEvent, registration: Registration) =>
  hasPriority(event, registration) ? 'registration.priority.hasPriority' : 'registration.priority.noPriority'

const paymentIconColor = (registration: Registration) =>
  registration.paymentStatus === 'SUCCESS' ? 'primary.main' : 'transparent'

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
  const needsPayment =
    Boolean(registration.shouldPay) && registration.paymentStatus !== 'DUPLICATE' && !paymentVerificationInProgress
  const paymentStatusText = paymentVerificationInProgress
    ? t('registration.notifications.paymentVerifying')
    : t(getPaymentStatus(registration, event))

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
          <ListItemIcon sx={{ color: paymentIconColor(registration), minWidth: 32 }}>
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
