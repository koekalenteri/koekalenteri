import type {
  GridCallbackDetails,
  GridCellParams,
  GridRowParams,
  GridRowSelectionModel,
  MuiEvent,
} from '@mui/x-data-grid'
import type React from 'react'
import type { SetStateAction } from 'react'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'
import { firstSelectedRow } from '@/lib/datagrid'
import { useOpenEventViewDialog } from '../../state'

interface UseEntryHandlersArgs {
  setSelectedRegistrationId?: (update: SetStateAction<string | undefined>) => void
  registrations: Array<{ id: string }>
}

export const useEntryHandlers = ({ setSelectedRegistrationId, registrations }: UseEntryHandlersArgs) => {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const openDialog = useOpenEventViewDialog()
  const handleOpen = (id: string) => {
    setSelectedRegistrationId?.(id)
    openDialog({ kind: 'edit' })
  }

  const handleCancel = (id: string) => {
    setSelectedRegistrationId?.(id)
    openDialog({ kind: 'cancel' })
  }

  const handleRefund = (id: string) => {
    setSelectedRegistrationId?.(id)
    openDialog({ kind: 'refund' })
  }

  const handleSelectionModeChange = (selection: GridRowSelectionModel, _details: GridCallbackDetails) => {
    const selected = firstSelectedRow(selection)
    const value = typeof selected === 'string' ? selected : undefined
    if (!value) return
    const reg = registrations.find((r) => r.id === value)
    setSelectedRegistrationId?.(reg?.id)
  }

  const handleCellClick = async (params: GridCellParams, event: MuiEvent<React.MouseEvent>) => {
    if (params.field === 'dog.regNo') {
      event.defaultMuiPrevented = true
      await navigator.clipboard.writeText(params.value as string)
      enqueueSnackbar({
        anchorOrigin: {
          horizontal: 'center',
          vertical: 'bottom',
        },
        autoHideDuration: 1000,
        message: t('registration.regNoCopied', 'Rekisterinumero kopioitu'),
        variant: 'info',
      })
    }
  }

  // Open the row the pointer landed on, not the selected one: a double click's own click has not
  // settled the selection yet, so the first double click opened an empty dialog.
  const handleDoubleClick = (params: GridRowParams<{ id: string }>) => {
    setSelectedRegistrationId?.(params.row.id)
    openDialog({ kind: 'edit' })
  }

  return {
    handleCancel,
    handleCellClick,
    handleDoubleClick,
    handleOpen,
    handleRefund,
    handleSelectionModeChange,
  }
}
