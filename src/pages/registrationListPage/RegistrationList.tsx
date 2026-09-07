import type { Theme } from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid'
import type { BreedCode, PublicDogEvent, Registration } from '../../types'
import CancelOutlined from '@mui/icons-material/CancelOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import { useMediaQuery } from '@mui/material'
import Typography from '@mui/material/Typography'
import { Box } from '@mui/system'
import { GridActionsCellItem } from '@mui/x-data-grid'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { getPaymentStatus } from '../../lib/payment'
import { hasPriority } from '../../lib/registration'
import { Path } from '../../routeConfig'
import { IconsTooltip, TooltipIcon } from '../components/IconsTooltip'
import { PaymentIcon } from '../components/icons/PaymentIcon'
import { PriorityIcon } from '../components/icons/PriorityIcon'
import StyledDataGrid from '../components/StyledDataGrid'

type StrippedRegistration = Omit<Registration, 'group' | 'internalNotes'>

/**
 * A column of icons still needs a name a screen reader can read out; the design has no room to show
 * one, so the header carries it out of sight.
 */
const headerLabelSx = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: -1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const

interface Props {
  readonly disabled?: boolean
  readonly event: PublicDogEvent
  readonly paymentVerificationInProgress?: boolean
  readonly rows: StrippedRegistration[]
  readonly onUnregister: (registration: StrippedRegistration) => void
}

interface RegistrationListItemTooltipIconsProps {
  registration: StrippedRegistration
  priority: boolean | 0.5
}

const RegistrationListItemTooltipIcons = ({
  registration,
  priority,
  event,
}: RegistrationListItemTooltipIconsProps & { event: PublicDogEvent }) => {
  const { t } = useTranslation()
  return (
    <>
      <TooltipIcon
        key="priority"
        text={priority ? t('registration.priority.hasPriority') : t('registration.priority.noPriority')}
        icon={<PriorityIcon dim priority={priority} fontSize="small" />}
      />
      <TooltipIcon
        key="payment"
        text={t(getPaymentStatus(registration, event))}
        icon={<PaymentIcon paymentStatus={registration.paymentStatus} fontSize="small" />}
      />
    </>
  )
}

const RegistrationListItemIcons = ({
  event,
  registration,
}: {
  event: PublicDogEvent
  registration: StrippedRegistration
}) => {
  const priority = hasPriority(event, registration)
  return (
    <IconsTooltip
      icons={<RegistrationListItemTooltipIcons registration={registration} priority={priority} event={event} />}
      placement="bottom-start"
    >
      <Box
        sx={{
          alignItems: 'center',
          display: 'flex',
          height: '28px',
        }}
      >
        <PriorityIcon dim priority={priority} fontSize="small" />
        <PaymentIcon dim paymentStatus={registration.paymentStatus} fontSize="small" />
      </Box>
    </IconsTooltip>
  )
}

export default function RegistrationList({
  event,
  disabled,
  rows,
  onUnregister,
  paymentVerificationInProgress = false,
}: Props) {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')
  const sm = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'))
  const navigate = useNavigate()

  const onEdit = (registration: StrippedRegistration) => {
    navigate(`${Path.registration(registration)}/edit`)
  }

  const allColumns: GridColDef<StrippedRegistration>[] = [
    {
      field: 'dog.name',
      flex: 1,
      headerName: t('dog.name'),
      renderCell: (params) => <strong>{params.value}</strong>,
      valueGetter: (_value, row) => row.dog.name,
    },
    {
      field: 'dog.regNo',
      headerName: t('dog.regNo'),
      type: sm ? 'custom' : 'string',
      valueGetter: (_value, row) => row.dog.regNo,
      width: 160,
    },
    {
      field: 'dog.breedCode',
      headerName: t('dog.breed'),
      type: sm ? 'custom' : 'string',
      valueGetter: (_value, row) => breed(row.dog.breedCode as BreedCode),
      width: 160,
    },
    {
      field: 'icons',
      headerName: '',
      renderCell: (params) => <RegistrationListItemIcons event={event} registration={params.row} />,
      renderHeader: () => (
        <Box component="span" sx={headerLabelSx}>
          {t('registration.stateAndPayment')}
        </Box>
      ),
      width: 48,
    },
    {
      field: 'actions',
      getActions: (params: { row: StrippedRegistration }) => {
        if (params.row.cancelled) {
          return [
            <GridActionsCellItem
              key="cancelled"
              showInMenu
              closeMenuOnClick
              disabled
              label={
                <Box component="span" sx={{ color: 'warning.main', cursor: 'default', textTransform: 'uppercase' }}>
                  {t('event.states.cancelled')}
                </Box>
              }
            />,
          ]
        }
        // Behind the menu, named rather than drawn (KOE-973): as bare icons on the row, the red cross
        // was read as a payment mark and the entrant paid a second time. Paying stays on the row —
        // it only appears when there is something to pay, so it says what the icons were mistaken for.
        const always = [
          <GridActionsCellItem
            disabled={disabled}
            key="edit"
            icon={<EditOutlined color="info" />}
            label={t('registration.actions.edit')}
            onClick={() => onEdit(params.row)}
            showInMenu
          />,
          <GridActionsCellItem
            disabled={disabled}
            key="cancel"
            icon={<CancelOutlined color="error" />}
            label={t('registration.actions.cancel')}
            onClick={() => onUnregister(params.row)}
            showInMenu
          />,
        ]
        if (
          !params.row.cancelled &&
          !paymentVerificationInProgress &&
          params.row.paymentStatus !== 'SUCCESS' &&
          params.row.paymentStatus !== 'PENDING' &&
          (event.paymentTime === 'registration' || params.row.confirmed)
        ) {
          return [
            <GridActionsCellItem
              disabled={disabled}
              key="pay"
              icon={<EuroOutlined color="info" />}
              label={t('registration.actions.pay')}
              onClick={() => navigate(Path.payment(params.row))}
            />,
            ...always,
          ]
        }
        return always
      },
      renderHeader: () => (
        <Box component="span" sx={headerLabelSx}>
          {t('actions')}
        </Box>
      ),
      type: 'actions',
      // At most the payment icon and the menu button now.
      width: 80,
    },
  ]

  const columns = allColumns.filter((c) => c.type !== 'custom')

  return (
    <Box sx={{ mb: 1, p: { md: 1, xs: 0.5 }, width: '100%' }}>
      <Typography variant="h5">{t('registration.registeredDogs')}</Typography>
      <Box sx={{ '& .cancelled': { opacity: 0.75 }, height: 120, width: '100%' }}>
        <StyledDataGrid
          hideFooter={true}
          columns={columns}
          initialState={{ density: 'compact' }}
          disableRowSelectionOnClick
          rows={rows}
          getRowId={(row) => row.id}
          getRowClassName={(params) => (params.row.cancelled ? 'cancelled' : '')}
          sx={{
            '& .MuiDataGrid-cell': {
              px: { sm: 1, xs: 0.5 },
            },
          }}
        />
      </Box>
    </Box>
  )
}
