import type { GridColDef } from '@mui/x-data-grid'
import type { ReactElement } from 'react'
import type { PublicDogEvent, Registration, RegistrationDate } from '../../../../types'
import type { TooltipContent } from '../../../components/IconsTooltip'

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
import Stack from '@mui/material/Stack'
import { GridActionsCellItem } from '@mui/x-data-grid'

import { formatMoney } from '../../../../lib/money'
import { canRefund, hasPriority, isPredefinedReason, priorityDescriptionKey } from '../../../../lib/registration'
import { PriorityIcon } from '../../../components/icons/PriorityIcon'
import { IconsTooltip } from '../../../components/IconsTooltip'
import RankingPoints from '../../../components/RankingPoints'

import GroupColors from './GroupColors'

interface RegistrationIconsProps {
  event: PublicDogEvent
  reg: Registration
}
const RegistrationIcons = ({ event, reg }: RegistrationIconsProps) => {
  const { t } = useTranslation()
  const priority = hasPriority(event, reg)

  const manualResultCount = useMemo(
    () => reg.qualifyingResults.filter((r) => !r.official).length,
    [reg.qualifyingResults]
  )
  const rankingPoints = useMemo(() => reg.qualifyingResults.reduce((acc, r) => acc + (r.rankingPoints ?? 0), 0), [reg])

  const tooltipContent: TooltipContent[] = useMemo(() => {
    const result: TooltipContent[] = []

    if (priority) {
      const key = priorityDescriptionKey(event, reg)
      const descr = key && t(`priorityDescription.${key}`)
      const info50 =
        priority === 0.5 ? (reg.owner.membership ? '(vain omistaja on jäsen)' : '(vain ohjaaja on jäsen)') : ''
      result.push({
        icon: <PriorityIcon priority={priority} fontSize="small" />,
        text: `Ilmoittautuja on etusijalla: ${descr} ${info50}`.trim(),
      })
    }
    if (reg.owner.membership) {
      result.push({
        icon: <PersonOutline fontSize="small" />,
        text: 'Omistaja on järjestävän yhdistyksen jäsen',
      })
    }
    if (reg.handler.membership) {
      result.push({
        icon: <PersonOutline fontSize="small" />,
        text: 'Ohjaaja on järjestävän yhdistyksen jäsen',
      })
    }
    if (reg.paidAt) {
      if (reg.refundStatus === 'PENDING') {
        result.push({
          icon: <SavingsOutlined fontSize="small" />,
          text: `Palautuksen käsittely on kesken. Palautetaan ${formatMoney(reg.refundAmount ?? 0)}, maksoi ${formatMoney(reg.paidAmount ?? 0)}`,
        })
      } else if (reg.refundAt) {
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
    if (reg.internalNotes?.trim()) {
      result.push({
        icon: <SpeakerNotesOutlined fontSize="small" />,
        text: 'Sisäinen kommentti: ' + reg.internalNotes,
      })
    }
    if (rankingPoints > 0) {
      result.push({
        icon: <RankingPoints points={rankingPoints} />,
        text: 'Karsintapisteet: ' + rankingPoints,
      })
    }
    return result
  }, [event, manualResultCount, priority, rankingPoints, reg, t])

  return (
    <IconsTooltip placement="right" items={tooltipContent}>
      <Stack direction="row" alignItems="center" mt="3px">
        <PriorityIcon dim priority={priority} fontSize="small" sx={{ opacity: priority ? 1 : 0.05 }} />
        <PersonOutline fontSize="small" sx={{ opacity: reg.handler.membership || reg.owner.membership ? 1 : 0.05 }} />
        {reg.refundAt || reg.refundStatus === 'PENDING' ? (
          <SavingsOutlined fontSize="small" />
        ) : (
          <EuroOutlined fontSize="small" sx={{ opacity: reg.paidAt ? 1 : 0.05 }} />
        )}
        <CheckOutlined fontSize="small" sx={{ opacity: reg.confirmed ? 1 : 0.05 }} />
        <MarkEmailReadOutlined fontSize="small" sx={{ opacity: reg.invitationRead ? 1 : 0.05 }} />
        <ErrorOutlineOutlined fontSize="small" sx={{ opacity: manualResultCount ? 1 : 0.05 }} />
        <CommentOutlined fontSize="small" sx={{ opacity: reg.notes.trim() ? 1 : 0.05 }} />
        <SpeakerNotesOutlined fontSize="small" sx={{ opacity: reg.internalNotes?.trim() ? 1 : 0.05 }} />
        <RankingPoints points={rankingPoints} />
      </Stack>
    </IconsTooltip>
  )
}

export function useClassEntrySelectionColumns(
  available: RegistrationDate[],
  event: PublicDogEvent,
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
        width: 30,
        minWidth: 30,
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
        width: 200, // icons * 20 + 20 for padding
        align: 'center',
        renderCell: (p) => <RegistrationIcons event={event} reg={p.row} />,
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
            p.row.cancelled ? null : (
              <GridActionsCellItem
                key="withdraw"
                icon={<EventBusyOutlined fontSize="small" />}
                label={t('withdraw')}
                onClick={() => cancelRegistration?.(p.row.id)}
                showInMenu
              />
            ),
            canRefund(p.row) ? (
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

    const cancelledColumns: GridColDef<Registration>[] = [...participantColumns]
    cancelledColumns.splice(cancelledColumns.length - 2, 0, {
      field: 'cancelReason',
      headerName: 'Perumisen syy',
      width: 144,
      valueFormatter: (v: string) => (isPredefinedReason(v) ? t(`registration.cancelReason.${v}`) : v),
    })

    return { cancelledColumns, entryColumns, participantColumns }
  }, [available, cancelRegistration, event, openEditDialog, refundRegistration, t])
}
