import type { PublicDogEvent, Registration } from '../../types'
import { Button } from '@aws-amplify/ui-react'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import PersonOutline from '@mui/icons-material/PersonOutline'
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
}

export const InfoBox = ({ event, registration }: Props) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const needsPayment = Boolean(registration.shouldPay)

  return (
    <Paper sx={{ bgcolor: 'background.selected', m: 1, p: 1 }}>
      <List disablePadding>
        <ListItem disablePadding>
          <ListItemIcon sx={{ color: priorityIconColor(event, registration), minWidth: 32 }}>
            <PersonOutline fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={t(priorityStatus(event, registration))}
            slotProps={{ primary: { fontWeight: 'bold', variant: 'subtitle1' } }}
          />
        </ListItem>
        <ListItem
          disablePadding
          secondaryAction={
            needsPayment ? (
              <Button aria-label={t('registration.cta.pay')} onClick={() => navigate(Path.payment(registration))}>
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
              registration.totalAmount
                ? `${t(getPaymentStatus(registration, event))} (${registration.totalAmount}€)`
                : t(getPaymentStatus(registration, event))
            }
            slotProps={{ primary: { fontWeight: 'bold', variant: 'subtitle1' } }}
            sx={{ pr: needsPayment ? 12 : 0 }}
          />
        </ListItem>
        <ListItem disablePadding>
          <ListItemIcon sx={{ color: 'primary.main', minWidth: 32 }}>
            <CheckOutlined fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary={t(registrationStatus(registration))}
            slotProps={{ primary: { fontWeight: 'bold', variant: 'subtitle1' } }}
          />
        </ListItem>
      </List>
    </Paper>
  )
}
