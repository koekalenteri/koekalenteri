import type { GridColDef } from '@mui/x-data-grid'
import type { ReactElement } from 'react'
import type { DogEvent, Registration, RegistrationDate } from '../../../../types'
import DragIndicatorOutlined from '@mui/icons-material/DragIndicatorOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import EmailOutlined from '@mui/icons-material/EmailOutlined'
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined'
import LowPriorityOutlined from '@mui/icons-material/LowPriorityOutlined'
import SpeakerNotesOutlined from '@mui/icons-material/SpeakerNotesOutlined'
import SwapHorizOutlined from '@mui/icons-material/SwapHorizOutlined'
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'
import { GridActionsCellItem } from '@mui/x-data-grid'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { breedAbbreviation } from '../../../../lib/dog'
import { isEventOngoing, isEventOver, registrationDatesOutsideClass } from '../../../../lib/event'
import {
  canRefund,
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  getRegistrationGroupKey,
  isPredefinedReason,
} from '../../../../lib/registration'
import GroupColors from './GroupColors'
import RegistrationIcons from './RegistrationIcons'

interface RegistrationActionCallbacks {
  openEditDialog?: (id: string) => void
  cancelRegistration?: (id: string) => void
  refundRegistration?: (id: string) => void
  moveToGroup?: (id: string) => void
  moveToPosition?: (id: string) => void
  moveToReserve?: (id: string) => void
  moveToParticipants?: (id: string) => void
  sendMessage?: (id: string) => void
  editInternalNotes?: (id: string) => void
  pendingMoveId?: string
  actionsDisabled?: boolean
  movementDisabled?: boolean
  canMoveReserveToPosition?: boolean
  canMoveToPosition?: (registration: Registration) => boolean
}

interface RegistrationActionsOptions {
  available: RegistrationDate[]
  callbacks?: RegistrationActionCallbacks
  event: DogEvent
  row: Registration
  t: (key: string) => any
}

const spinnerOr = (icon: ReactElement, pending: boolean) => (pending ? <CircularProgress size={18} /> : icon)

const getParticipantMovementActions = ({
  available,
  callbacks,
  event,
  isPendingMove,
  row,
  t,
}: RegistrationActionsOptions & { isPendingMove: boolean }): ReactElement[] => {
  const actions: ReactElement[] = []

  if (available.length > 1) {
    actions.push(
      <GridActionsCellItem
        key="moveToGroup"
        disabled={isPendingMove || Boolean(callbacks?.movementDisabled)}
        icon={spinnerOr(<SwapHorizOutlined fontSize="small" />, isPendingMove)}
        label={t('registration.actions.moveToGroup')}
        onClick={() => callbacks?.moveToGroup?.(row.id)}
        showInMenu
      />
    )
  }

  actions.push(
    <GridActionsCellItem
      key="moveToPosition"
      disabled={isPendingMove || Boolean(callbacks?.movementDisabled) || callbacks?.canMoveToPosition?.(row) === false}
      icon={spinnerOr(<LowPriorityOutlined fontSize="small" />, isPendingMove)}
      label={t('registration.actions.moveToPosition')}
      onClick={() => callbacks?.moveToPosition?.(row.id)}
      showInMenu
    />,
    <GridActionsCellItem
      key="moveToReserve"
      disabled={
        isPendingMove || Boolean(callbacks?.movementDisabled) || event.state === 'picked' || event.state === 'invited'
      }
      icon={spinnerOr(<LowPriorityOutlined fontSize="small" />, isPendingMove)}
      label={t('registration.actions.moveToReserve')}
      onClick={() => callbacks?.moveToReserve?.(row.id)}
      showInMenu
    />
  )

  return actions
}

const getReserveMovementActions = ({
  callbacks,
  isPendingMove,
  row,
  t,
}: RegistrationActionsOptions & { isPendingMove: boolean }): ReactElement[] => [
  <GridActionsCellItem
    key="moveToParticipants"
    disabled={isPendingMove || Boolean(callbacks?.movementDisabled)}
    icon={spinnerOr(<SwapHorizOutlined fontSize="small" />, isPendingMove)}
    label={t('registration.actions.moveToParticipants')}
    onClick={() => callbacks?.moveToParticipants?.(row.id)}
    showInMenu
  />,
  <GridActionsCellItem
    key="moveToPosition"
    disabled={isPendingMove || Boolean(callbacks?.movementDisabled) || callbacks?.canMoveReserveToPosition === false}
    icon={spinnerOr(<LowPriorityOutlined fontSize="small" />, isPendingMove)}
    label={t('registration.actions.moveToPosition')}
    onClick={() => callbacks?.moveToPosition?.(row.id)}
    showInMenu
  />,
]

const getCancelledMovementActions = ({
  callbacks,
  isPendingMove,
  row,
  t,
}: RegistrationActionsOptions & { isPendingMove: boolean }): ReactElement[] => [
  <GridActionsCellItem
    key="moveToReserve"
    disabled={isPendingMove || Boolean(callbacks?.movementDisabled)}
    icon={spinnerOr(<LowPriorityOutlined fontSize="small" />, isPendingMove)}
    label={t('registration.actions.moveToReserve')}
    onClick={() => callbacks?.moveToReserve?.(row.id)}
    showInMenu
  />,
]

const getMovementActions = (options: RegistrationActionsOptions & { groupKey: string; isPendingMove: boolean }) => {
  if (options.groupKey === GROUP_KEY_RESERVE) return getReserveMovementActions(options)
  if (options.groupKey === GROUP_KEY_CANCELLED) return getCancelledMovementActions(options)
  return getParticipantMovementActions(options)
}

const createRegistrationActions = (options: RegistrationActionsOptions): ReactElement[] => {
  const { callbacks, row, t } = options
  const actionsDisabled = Boolean(callbacks?.actionsDisabled)
  const groupKey = getRegistrationGroupKey(row)
  const isPendingMove = callbacks?.pendingMoveId === row.id
  const actions = getMovementActions({ ...options, groupKey, isPendingMove })

  if (canRefund(row) && (row.refundAmount ?? 0) < (row.paidAmount ?? 0)) {
    actions.push(
      <GridActionsCellItem
        key="refund"
        icon={<EventBusyOutlined fontSize="small" />}
        label={t('registration.actions.refundPayment')}
        onClick={() => callbacks?.refundRegistration?.(row.id)}
        showInMenu
      />
    )
  }

  actions.push(
    <GridActionsCellItem
      key="edit"
      disabled={actionsDisabled}
      icon={<EditOutlined fontSize="small" />}
      label={t('registration.actions.edit')}
      onClick={() => callbacks?.openEditDialog?.(row.id)}
      showInMenu
    />
  )

  if (groupKey !== GROUP_KEY_CANCELLED) {
    actions.push(
      <GridActionsCellItem
        key="cancel"
        disabled={actionsDisabled}
        icon={<EventBusyOutlined fontSize="small" />}
        label={t('registration.actions.cancel')}
        onClick={() => callbacks?.cancelRegistration?.(row.id)}
        showInMenu
      />
    )
  }

  actions.push(
    <GridActionsCellItem
      key="editInternalNotes"
      disabled={actionsDisabled}
      icon={<SpeakerNotesOutlined fontSize="small" />}
      label={t('registration.actions.editInternalNotes')}
      onClick={() => callbacks?.editInternalNotes?.(row.id)}
      showInMenu
    />
  )

  actions.push(
    <GridActionsCellItem
      key="sendMessage"
      disabled={actionsDisabled}
      icon={<EmailOutlined fontSize="small" />}
      label={t('registration.actions.sendMessage')}
      onClick={() => callbacks?.sendMessage?.(row.id)}
      showInMenu
    />
  )

  return actions
}

export function useClassEntrySelectionColumns(
  available: RegistrationDate[],
  event: DogEvent,
  callbacks?: RegistrationActionCallbacks
) {
  const { t } = useTranslation()

  const createColumnDefinitions = useCallback(() => {
    const columnConfigs: Array<Partial<GridColDef<Registration>> & { field: string }> = [
      {
        cellClassName: 'nopad',
        display: 'flex',
        field: 'dates',
        headerName: '',
        minWidth: 56,
        renderCell: (p) => {
          const outside = p.row.cancelled ? [] : registrationDatesOutsideClass(event, p.row.class, p.row.dates)
          return (
            <>
              <DragIndicatorOutlined />
              {outside.length ? (
                <Tooltip
                  title={t(p.row.class ? 'eventManagement.datesOutsideClass' : 'eventManagement.datesOutsideEvent', {
                    class: p.row.class,
                    dates: outside.map((rd) => t('dateFormat.date', { date: rd.date })).join(', '),
                  })}
                >
                  <WarningAmberOutlined color="warning" />
                </Tooltip>
              ) : (
                <GroupColors available={available} selected={p.row.dates} />
              )}
            </>
          )
        },
        width: 56,
      },
      {
        align: 'right',
        cellClassName: 'nopad',
        field: 'number',
        headerAlign: 'right',
        headerClassName: 'nopad',
        headerName: '#',
        minWidth: 30,
        renderCell: (p) => {
          // The frozen, published number wins over the working order (KOE-1017): once numbers are
          // out, this column shows the truth the public list carries — for cancelled dogs too.
          const n = p.row.startGroup?.number ?? p.row.group?.number
          if (!n) return ''
          if (Number.isInteger(n)) return `${n}`
          return <CircularProgress size={10} thickness={5} />
        },
        width: 30,
      },
      {
        field: 'dog.name',
        flex: 1,
        headerName: t('dog.name'),
        valueGetter: (_value, row) => row.dog.name,
        width: 250,
      },
      {
        field: 'dog.regNo',
        headerName: t('dog.regNo'),
        valueGetter: (_value, row) => row.dog.regNo,
        width: 130,
      },
      {
        field: 'dob.breed',
        headerName: t('dog.breed'),
        minWidth: 56,
        valueGetter: (_value, row) => breedAbbreviation(t, row.dog?.breedCode, row.dog?.gender),
        width: 56,
      },
      {
        field: 'handler',
        flex: 1,
        headerName: t('handler'),
        valueGetter: (_value, row) => row.handler?.name,
        width: 150,
      },
      {
        field: 'lastEmail',
        flex: 1,
        headerName: 'Viesti',
        valueGetter: (_value, row) => row.lastEmail ?? '',
        width: 130,
      },
      {
        align: 'center',
        field: 'icons',
        headerName: '',
        renderCell: (p) => <RegistrationIcons event={event} reg={p.row} />,
        width: 240, // icons * 20 + 20 for padding
      },
      {
        cellClassName: 'nopad',
        field: 'actions',
        getActions: (p) =>
          createRegistrationActions({ available, callbacks, event, row: p.row, t: t as (key: string) => string }),
        headerName: '',
        minWidth: 44,
        type: 'actions',
        width: 44,
      },
    ]

    // Apply common properties to all columns
    return columnConfigs.map((config) => ({
      ...config,
      sortable: false, // Common property for all columns
    })) as GridColDef<Registration>[]
  }, [available, callbacks, event, t])

  return useMemo(() => {
    const entryColumns = createColumnDefinitions()

    const participantColumns = [...entryColumns]

    // KOE-72: once results are being recorded, the secretary's own participant list shows them. Not
    // before the dogs run, when the column could only ever be empty.
    if (isEventOngoing(event) || isEventOver(event)) {
      participantColumns.splice(-2, 0, {
        field: 'result',
        headerName: t('results.column.result'),
        minWidth: 70,
        sortable: false,
        valueGetter: (_value, row) => row.eventResult?.result ?? '',
        width: 70,
      })
    }

    const cancelledColumns = [...participantColumns]
    cancelledColumns.splice(-2, 0, {
      field: 'cancelReason',
      headerName: 'Perumisen syy',
      minWidth: 144,
      sortable: false,
      valueFormatter: (v: string) => (isPredefinedReason(v) ? t(`registration.cancelReason.${v}`) : v),
      width: 144,
    })

    return { cancelledColumns, entryColumns, participantColumns }
  }, [t, createColumnDefinitions, event])
}
