import type { GridCallbackDetails, GridCellParams, GridRowSelectionModel, MuiEvent } from '@mui/x-data-grid'
import type React from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { SetterOrUpdater } from 'recoil'
import { useSnackbar } from 'notistack'
import { useTranslation } from 'react-i18next'

interface UseEntryHandlersArgs {
  setOpen?: Dispatch<SetStateAction<boolean>>
  setCancelOpen?: Dispatch<SetStateAction<boolean>>
  setRefundOpen?: Dispatch<SetStateAction<boolean>>
  setSelectedRegistrationId?: SetterOrUpdater<string | undefined>
  registrations: Array<{ id: string }>
}

export const useEntryHandlers = ({
  setOpen,
  setCancelOpen,
  setRefundOpen,
  setSelectedRegistrationId,
  registrations,
}: UseEntryHandlersArgs) => {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const handleOpen = (id: string) => {
    setSelectedRegistrationId?.(id)
    setOpen?.(true)
  }

  const handleCancel = (id: string) => {
    setSelectedRegistrationId?.(id)
    setCancelOpen?.(true)
  }

  const handleRefund = (id: string) => {
    setSelectedRegistrationId?.(id)
    setRefundOpen?.(true)
  }

  const handleSelectionModeChange = (selection: GridRowSelectionModel, _details: GridCallbackDetails) => {
    const value = typeof selection[0] === 'string' ? selection[0] : undefined
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

  const handleDoubleClick = () => setOpen?.(true)

  return {
    handleCancel,
    handleCellClick,
    handleDoubleClick,
    handleOpen,
    handleRefund,
    handleSelectionModeChange,
  }
}
