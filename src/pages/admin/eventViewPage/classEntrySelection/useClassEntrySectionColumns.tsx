import type { TooltipProps } from '@mui/material/Tooltip'
import type { GridColDef, GridValueGetterParams } from '@mui/x-data-grid'
import type { BreedCode, Registration, RegistrationDate } from '../../../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import DragIndicatorOutlined from '@mui/icons-material/DragIndicatorOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined'
import MarkEmailReadOutlined from '@mui/icons-material/MarkEmailReadOutlined'
import PersonOutline from '@mui/icons-material/PersonOutline'
import { styled } from '@mui/material'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Tooltip, { tooltipClasses } from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { GridActionsCellItem } from '@mui/x-data-grid'

import GroupColors from './GroupColors'

const IconsTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} classes={{ popper: className }} />
))({
  [`& .${tooltipClasses.tooltip}`]: {
    maxWidth: 'none',
  },
})

type TooltipContent = { text: string; icon: JSX.Element }

const IconsTooltipContent = ({ roles }: { roles: TooltipContent[] }) => (
  <Box>
    {roles.map((role) => (
      <Box display="flex" alignItems="center">
        {role.icon}&nbsp;<Typography fontSize="small">{role.text}</Typography>
      </Box>
    ))}
  </Box>
)

const RegistrationIcons = ({ confirmed, invitationRead, handler, paidAt, qualifyingResults }: Registration) => {
  const { t } = useTranslation()

  const manualResultCount = useMemo(() => qualifyingResults.filter((r) => !r.official).length, [qualifyingResults])

  const tooltipContent: TooltipContent[] = useMemo(() => {
    const result: TooltipContent[] = []
    if (handler.membership) {
      result.push({
        icon: <PersonOutline fontSize="small" />,
        text: 'Ilmoittautuja on järjestävän yhdistyksen jäsen',
      })
    }
    if (paidAt) {
      result.push({
        icon: <EuroOutlined fontSize="small" />,
        text: 'Ilmoittautuja on maksanut ilmoittautumisen',
      })
    }
    if (confirmed) {
      result.push({
        icon: <CheckOutlined fontSize="small" />,
        text: 'Ilmoittautuja on vahvistanut ottavansa koepaikan vastaan',
      })
    }
    if (invitationRead) {
      result.push({
        icon: <MarkEmailReadOutlined fontSize="small" />,
        text: 'Ilmoittautuja on kuitannut koekutsun',
      })
    }
    if (manualResultCount > 0) {
      result.push({
        icon: <ErrorOutlineOutlined fontSize="small" />,
        text: 'Ilmoittautuja on lisännyt koetuloksia',
      })
    }
    return result
  }, [confirmed, handler.membership, invitationRead, manualResultCount, paidAt])

  return (
    <IconsTooltip placement="right" title={<IconsTooltipContent roles={tooltipContent} />}>
      <Stack direction="row" alignItems="center">
        <PersonOutline fontSize="small" sx={{ opacity: handler.membership ? 1 : 0.05 }} />
        <EuroOutlined fontSize="small" sx={{ opacity: paidAt ? 1 : 0.05 }} />
        <CheckOutlined fontSize="small" sx={{ opacity: confirmed ? 1 : 0.05 }} />
        <MarkEmailReadOutlined fontSize="small" sx={{ opacity: invitationRead ? 1 : 0.05 }} />
        <ErrorOutlineOutlined fontSize="small" sx={{ opacity: manualResultCount ? 1 : 0 }} />
      </Stack>
    </IconsTooltip>
  )
}

export function useClassEntrySelectionColumns(
  available: RegistrationDate[],
  openEditDialog?: (id: string) => void,
  cancelRegistration?: (id: string) => void,
  refundRegistration?: (id: string) => void
) {
  const { t } = useTranslation()

  return useMemo(() => {
    const entryColumns: GridColDef<Registration>[] = [
      {
        cellClassName: 'nopad',
        field: 'dates',
        headerName: '',
        width: 56,
        minWidth: 56,
        renderCell: (p) => (
          <>
            <DragIndicatorOutlined />
            <GroupColors available={available} selected={p.row.dates} />
          </>
        ),
        sortable: false,
      },
      {
        align: 'right',
        cellClassName: 'nopad',
        field: 'number',
        headerAlign: 'right',
        headerClassName: 'nopad',
        headerName: '#',
        width: 20,
        minWidth: 20,
        sortable: false,
        valueGetter: (p) => (p.row.group?.number ? `${p.row.group.number}.` : ''),
      },
      {
        field: 'dog.name',
        headerName: t('dog.name'),
        width: 250,
        flex: 1,
        sortable: false,
        valueGetter: (p: GridValueGetterParams<Registration, string>) => p.row.dog.name,
      },
      {
        field: 'dog.regNo',
        headerName: t('dog.regNo'),
        width: 130,
        sortable: false,
        valueGetter: (p) => p.row.dog.regNo,
      },
      {
        field: 'dob.breed',
        headerName: t('dog.breed'),
        width: 150,
        sortable: false,
        valueGetter: (p: GridValueGetterParams<Registration, BreedCode>) =>
          p.row.dog?.breedCode && p.row.dog?.gender
            ? t(`${p.row.dog.breedCode}.${p.row.dog.gender}`, { ns: 'breedAbbr', defaultValue: p.row.dog.breedCode })
            : '',
      },
      {
        field: 'handler',
        headerName: t('registration.handler'),
        width: 150,
        flex: 1,
        sortable: false,
        valueGetter: (p) => p.row.handler.name,
      },
      {
        field: 'lastEmail',
        headerName: 'Viesti',
        width: 130,
        flex: 1,
        sortable: false,
        valueGetter: (p) => p.row.lastEmail ?? '',
      },
      {
        field: 'icons',
        headerName: '',
        width: 100,
        align: 'center',
        renderCell: (p) => <RegistrationIcons {...p.row} />,
        sortable: false,
      },
      {
        cellClassName: 'nopad',
        field: 'actions',
        type: 'actions',
        headerName: '',
        width: 30,
        minWidth: 30,
        sortable: false,
        getActions: (p) => [
          <GridActionsCellItem
            key="edit"
            icon={<EditOutlined fontSize="small" />}
            label={t('edit')}
            onClick={() => openEditDialog?.(p.row.id)}
            showInMenu
          />,
          <GridActionsCellItem
            key="withdraw"
            icon={<EventBusyOutlined fontSize="small" />}
            label={t('withdraw')}
            onClick={() => cancelRegistration?.(p.row.id)}
            showInMenu
          />,
          <GridActionsCellItem
            key="refund"
            icon={<EventBusyOutlined fontSize="small" />}
            label={t('refund')}
            onClick={() => refundRegistration?.(p.row.id)}
            showInMenu
            disabled
          />,
        ],
      },
    ]

    const participantColumns: GridColDef<Registration>[] = [...entryColumns]

    const cancelledColumns: GridColDef<Registration>[] = [...participantColumns]
    cancelledColumns.splice(cancelledColumns.length - 2, 0, {
      field: 'cancelReason',
      headerName: 'Perumisen syy',
      width: 90,
    })

    return { cancelledColumns, entryColumns, participantColumns }
  }, [available, cancelRegistration, openEditDialog, refundRegistration, t])
}
