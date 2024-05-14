import type { TooltipProps } from '@mui/material/Tooltip'
import type { GridColDef } from '@mui/x-data-grid'
import type { ReactElement } from 'react'
import type { Registration, RegistrationDate } from '../../../../types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import CommentOutlined from '@mui/icons-material/CommentOutlined'
import DragIndicatorOutlined from '@mui/icons-material/DragIndicatorOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined'
import MarkEmailReadOutlined from '@mui/icons-material/MarkEmailReadOutlined'
import PersonOutline from '@mui/icons-material/PersonOutline'
import SavingsOutlined from '@mui/icons-material/SavingsOutlined'
import SpeakerNotesOutlined from '@mui/icons-material/SpeakerNotesOutlined'
import { styled } from '@mui/material'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Tooltip, { tooltipClasses } from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { GridActionsCellItem } from '@mui/x-data-grid'

import { formatMoney } from '../../../../lib/money'

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
      <Box key={role.text} display="flex" alignItems="center">
        {role.icon}&nbsp;<Typography fontSize="small">{role.text}</Typography>
      </Box>
    ))}
  </Box>
)

const RegistrationIcons = (reg: Registration) => {
  const { t } = useTranslation()

  const manualResultCount = useMemo(
    () => reg.qualifyingResults.filter((r) => !r.official).length,
    [reg.qualifyingResults]
  )

  const tooltipContent: TooltipContent[] = useMemo(() => {
    const result: TooltipContent[] = []
    if (reg.handler.membership || reg.owner.membership) {
      result.push({
        icon: <PersonOutline fontSize="small" />,
        text: 'Ilmoittautuja on järjestävän yhdistyksen jäsen',
      })
    }
    if (reg.paidAt) {
      if (reg.refundAt) {
        result.push({
          icon: <SavingsOutlined fontSize="small" />,
          text: `Ilmoittautumismaksua on palautettu. Palautettu ${formatMoney(reg.refundAmount ?? 0)}, maksoi ${formatMoney(reg.paidAmount ?? 0)}`,
        })
      } else {
        result.push({
          icon: <EuroOutlined fontSize="small" />,
          text: `Ilmoittautuja on maksanut ilmoittautumisen: ${formatMoney(reg.paidAmount ?? 0)}`,
        })
      }
    }
    if (reg.confirmed) {
      result.push({
        icon: <CheckOutlined fontSize="small" />,
        text: 'Ilmoittautuja on vahvistanut ottavansa koepaikan vastaan',
      })
    }
    if (reg.invitationRead) {
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
    if (reg.notes.trim()) {
      result.push({
        icon: <CommentOutlined fontSize="small" />,
        text: 'Ilmoittautuja on lisännyt lisätietoja',
      })
    }
    if (reg.internalNotes?.trim()) {
      result.push({
        icon: <SpeakerNotesOutlined fontSize="small" />,
        text: 'Sisäinen kommentti: ' + reg.internalNotes,
      })
    }
    return result
  }, [
    manualResultCount,
    reg.confirmed,
    reg.handler.membership,
    reg.internalNotes,
    reg.invitationRead,
    reg.notes,
    reg.owner.membership,
    reg.paidAmount,
    reg.paidAt,
    reg.refundAmount,
    reg.refundAt,
  ])

  return (
    <IconsTooltip placement="right" title={<IconsTooltipContent roles={tooltipContent} />}>
      <Stack direction="row" alignItems="center">
        <PersonOutline fontSize="small" sx={{ opacity: reg.handler.membership || reg.owner.membership ? 1 : 0.05 }} />
        {reg.refundAt ? (
          <SavingsOutlined fontSize="small" />
        ) : (
          <EuroOutlined fontSize="small" sx={{ opacity: reg.paidAt ? 1 : 0.05 }} />
        )}
        <CheckOutlined fontSize="small" sx={{ opacity: reg.confirmed ? 1 : 0.05 }} />
        <MarkEmailReadOutlined fontSize="small" sx={{ opacity: reg.invitationRead ? 1 : 0.05 }} />
        <ErrorOutlineOutlined fontSize="small" sx={{ opacity: manualResultCount ? 1 : 0.05 }} />
        <CommentOutlined fontSize="small" sx={{ opacity: reg.notes.trim() ? 1 : 0.05 }} />
        <SpeakerNotesOutlined fontSize="small" sx={{ opacity: reg.internalNotes?.trim() ? 1 : 0.05 }} />
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
        display: 'flex',
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
        valueGetter: (_value, row) => (row.group?.number ? `${row.group.number}.` : ''),
      },
      {
        field: 'dog.name',
        headerName: t('dog.name'),
        width: 250,
        flex: 1,
        sortable: false,
        valueGetter: (_value, row) => row.dog.name,
      },
      {
        field: 'dog.regNo',
        headerName: t('dog.regNo'),
        width: 130,
        sortable: false,
        valueGetter: (_value, row) => row.dog.regNo,
      },
      {
        field: 'dob.breed',
        headerName: t('dog.breed'),
        width: 150,
        sortable: false,
        valueGetter: (_value, row) =>
          row.dog?.breedCode && row.dog?.gender
            ? t(`${row.dog.breedCode}.${row.dog.gender}`, { ns: 'breedAbbr', defaultValue: row.dog.breedCode })
            : '',
      },
      {
        field: 'handler',
        headerName: t('registration.handler'),
        width: 150,
        flex: 1,
        sortable: false,
        valueGetter: (_value, row) => row.handler.name,
      },
      {
        field: 'lastEmail',
        headerName: 'Viesti',
        width: 130,
        flex: 1,
        sortable: false,
        valueGetter: (_value, row) => row.lastEmail ?? '',
      },
      {
        field: 'icons',
        headerName: '',
        width: 150,
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
        getActions: (p) =>
          [
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
            p.row.cancelled ? (
              <GridActionsCellItem
                key="refund"
                icon={<EventBusyOutlined fontSize="small" />}
                label={t('refund')}
                onClick={() => refundRegistration?.(p.row.id)}
                showInMenu
                disabled={(p.row.refundAmount ?? 0) === (p.row.paidAmount ?? 0)}
              />
            ) : null,
          ].filter((a): a is ReactElement => a !== null),
      },
    ]

    const participantColumns: GridColDef<Registration>[] = [...entryColumns]
    const isPredefinedReason = (v: string): v is 'dog-heat' | 'handler-sick' | 'dog-sick' | 'moved-classes' | 'gdpr' =>
      ['dog-heat', 'handler-sick', 'dog-sick', 'moved-classes', 'gdpr'].includes(v)

    const cancelledColumns: GridColDef<Registration>[] = [...participantColumns]
    cancelledColumns.splice(cancelledColumns.length - 2, 0, {
      field: 'cancelReason',
      headerName: 'Perumisen syy',
      width: 150,
      valueFormatter: (v: string) => (isPredefinedReason(v) ? t(`registration.cancelReason.${v}`) : v),
    })

    return { cancelledColumns, entryColumns, participantColumns }
  }, [available, cancelRegistration, openEditDialog, refundRegistration, t])
}
