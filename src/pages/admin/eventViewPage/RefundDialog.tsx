import type { GridRowSelectionModel } from '@mui/x-data-grid'
import type { ChangeEventHandler } from 'react'
import type { RefundPaymentResponse, Registration, Transaction } from '../../../types'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { useSnackbar } from 'notistack'

import { APIError } from '../../../api/http'
import useDebouncedCallback from '../../../hooks/useDebouncedCallback'
import { formatMoney } from '../../../lib/money'
import { NullComponent } from '../../components/NullComponent'
import StyledDataGrid from '../../components/StyledDataGrid'
import { useAdminRegistrationActions } from '../recoil/registrations/actions'

import { RefundFooter } from './refundDialog/RefundFooter'
import { useRefundColumns } from './refundDialog/useRefundColumns'

const successMessages: Record<string, string> = {
  // Format: [status]_[provider]
  'ok_email refund':
    'Maksun palautus on kesken. Ilmoittautujalle on lähetetty sähköposti rahojen palautuksen viimeistelyä varten. Näet audit trailista, kun palautus on käsitelty loppuun.',
  ok_default: 'Maksu palautettu',
  'pending_email refund':
    'Maksun palautus on aloitettu. Ilmoittautujalle on lähetetty sähköposti rahojen palautuksen viimeistelyä varten. Näet audit trailista, kun palautus on käsitelty loppuun.',
  pending_default: 'Maksun palautus on aloitettu. Näet audit trailista, kun palautus on käsitelty loppuun.',
  default:
    'Maksun palautus epäonnistui. Tarkista että Paytrailin tilillä on tarpeeksi katetta palautukseen, tai yritä myöhemmin uudelleen.',
}

const errorMessages = {
  '404': 'Maksutapahtumaa ei löydy. Tapahtuma on todennäköisesti liian vanha palautettavaksi.',
  refund_balance: (remainingAmount: string) =>
    `Palautettava määrä ylittää palauttamattoman maksun osuuden. Palauttamatta: ${remainingAmount}`,
  default:
    'Maksun palautus epäonnistui. Tarkista että Paytrailin tilillä on tarpeeksi katetta palautukseen, tai yritä myöhemmin uudelleen.',
}

interface Props {
  readonly registration: Registration
  readonly open?: boolean
  readonly onClose?: () => void
}

const transactionAmount = (t: Transaction) => (t.type === 'refund' ? -1 * t.amount : t.amount)

export const RefundDailog = ({ open, registration, onClose }: Props) => {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const [loading, setLoading] = useState<boolean>(false)
  const [loadedId, setLoadedId] = useState<string>('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selection, setSelection] = useState<GridRowSelectionModel>()
  const [handlingCost, setHandlingCost] = useState<number>(0)
  const [internalNotes, setInternalNotes] = useState(registration.internalNotes ?? '')
  const actions = useAdminRegistrationActions(registration.eventId)
  const columns = useRefundColumns()

  const okTransactions = useMemo(() => transactions.filter((t) => t.status === 'ok'), [transactions])

  const selectedTransactions = useMemo(
    () => okTransactions.filter((t) => selection?.includes(t.transactionId)),
    [selection, okTransactions]
  )

  const total = useMemo(
    () => okTransactions.reduce((total, transaction) => total + transactionAmount(transaction), 0),
    [okTransactions]
  )
  const refundAmount = useMemo(
    () => selectedTransactions.reduce((total, transaction) => total + transactionAmount(transaction), 0),
    [selectedTransactions]
  )

  const canHaveHandlingCosts = selectedTransactions.some((t) => !!t.items)

  useEffect(() => {
    if (!open || !registration || registration.id === loadedId || loading) return

    setLoading(true)

    actions
      .transactions(registration.eventId, registration.id)
      .then((loaded) => {
        setTransactions((loaded ?? []).filter((t) => t.status !== 'fail' && t.status !== 'new'))
        setLoading(false)
        setLoadedId(registration.id)
      })
      .catch(() => {
        setTransactions([])
        setLoading(false)
        setLoadedId(registration.id)
      })
  }, [actions, loadedId, loading, open, registration])

  useEffect(() => {
    const payments = okTransactions.filter((t) => t.type === 'payment')
    if (payments.length === 1) {
      setSelection([payments[0].transactionId!])
      if (!payments[0].items && handlingCost) {
        setHandlingCost(0)
      }
    }
  }, [handlingCost, okTransactions])

  useEffect(() => {
    setInternalNotes(registration.internalNotes ?? '')
  }, [registration.internalNotes])

  const dispatchNotesChange = useDebouncedCallback(async (notes: string) => {
    await actions.putInternalNotes(registration.eventId, registration.id, notes)
  }, 1000)

  const handleNotesChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>(
    (e) => {
      const newValue = e.target.value
      setInternalNotes(newValue)
      dispatchNotesChange(newValue)
    },
    [dispatchNotesChange]
  )

  const handleCostChange = useCallback((value?: number) => setHandlingCost(value ?? 0), [])

  const handleClose = useCallback(() => {
    setLoading(false)
    setLoadedId('')
    setTransactions([])
    setSelection(undefined)
    onClose?.()
  }, [onClose])

  const showSuccessMessage = useCallback(
    (response: RefundPaymentResponse) => {
      // Cast to our defined types for better type safety
      const status = response?.status ?? 'default'
      const provider = response?.provider ?? 'default'

      // Try specific key first
      const messageKey = `${status}_${provider}`

      // Use a safer approach with explicit fallback chain
      let message: string

      // Check if the specific key exists in our messages
      if (messageKey in successMessages) {
        message = successMessages[messageKey]
      } else if (`${status}_default` in successMessages) {
        // Try the default provider for this status
        message = successMessages[`${status}_default`]
      } else {
        // Fall back to the default message
        message = successMessages.default
      }

      // Only show success variant for ok or pending status
      const variant = status === 'ok' || status === 'pending' ? 'success' : 'error'
      enqueueSnackbar(message, { variant })

      // Close dialog for successful refunds
      if (status === 'ok' || status === 'pending') {
        handleClose()
      }
    },
    [successMessages, enqueueSnackbar, handleClose]
  )

  // Helper function to extract remaining balance from error details
  const extractRemainingBalance = useCallback((errorBody?: string): string | null => {
    if (!errorBody) return null

    try {
      const details = JSON.parse(errorBody)

      if (details?.message === 'Refund amount exceeds the remaining refund balance') {
        const remaining = details?.meta?.invalidRefunds?.[0]?.remainingRefundBalance
        // The remaining balance is in cents, so divide by 100 to get euros
        return remaining ? formatMoney(remaining / 100) : '(ei tiedossa)'
      }

      return null
    } catch {
      return null
    }
  }, [])

  const handleRefundError = useCallback(
    (error: unknown) => {
      // Early return if not an API error
      if (!(error instanceof APIError)) return

      // Handle specific error types
      switch (error.status) {
        case 404: {
          // Transaction not found error
          enqueueSnackbar(errorMessages['404'], { variant: 'error' })
          return
        }

        case 400: {
          // Check for refund balance error
          const remainingAmount = extractRemainingBalance(error.body?.error)
          if (remainingAmount) {
            enqueueSnackbar(errorMessages.refund_balance(remainingAmount), { variant: 'error' })
            return
          }
          break
        }
      }

      // Default error message for all other cases
      enqueueSnackbar(errorMessages.default, { variant: 'error' })
    },
    [errorMessages, enqueueSnackbar, extractRemainingBalance]
  )

  const handleRefund = useCallback(async () => {
    if (!selectedTransactions.length) return

    const transaction = selectedTransactions[0]
    const amount = Math.min(total, transaction.amount) - handlingCost

    try {
      const response = await actions.refund(registration, transaction.transactionId, amount)
      if (!response || response.status === 'fail') {
        // For failed refunds, show the default error message
        enqueueSnackbar(errorMessages.default, { variant: 'error' })
      } else {
        showSuccessMessage(response)
      }
    } catch (error) {
      handleRefundError(error)
    }
  }, [
    selectedTransactions,
    total,
    handlingCost,
    actions,
    registration,
    showSuccessMessage,
    handleRefundError,
    enqueueSnackbar,
    errorMessages,
  ])

  return (
    <Dialog open={!!open} maxWidth="md" fullWidth>
      <DialogTitle>
        {t('registration.refundDialog.title', { regNo: registration.dog.regNo, payer: registration.payer.name })}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>{t('registration.refundDialog.text')}</DialogContentText>
        <StyledDataGrid
          loading={loading}
          checkboxSelection
          columns={columns}
          disableColumnResize
          disableMultipleRowSelection
          getRowId={(row) => row.transactionId}
          hideFooterPagination
          hideFooterSelectedRowCount
          initialState={{
            sorting: {
              sortModel: [{ field: 'createdAt', sort: 'asc' }],
            },
          }}
          isRowSelectable={(params) => params.row.status === 'ok' && params.row.type === 'payment' && total > 0}
          onRowSelectionModelChange={setSelection}
          rows={transactions}
          rowSelectionModel={selection}
          slots={{
            footer: RefundFooter,
            noRowsOverlay: NullComponent,
          }}
          slotProps={{
            footer: {
              canHaveHandlingCosts,
              total,
              selectedTotal: refundAmount,
              handlingCost: handlingCost ?? 0,
              onHandlingCostChange: handleCostChange,
            },
          }}
        ></StyledDataGrid>
        <DialogContentText sx={{ my: 1 }} display={selectedTransactions.length ? undefined : 'none'}>
          {t(canHaveHandlingCosts ? 'registration.refundDialog.costsText' : 'registration.refundDialog.noCostsText')}
        </DialogContentText>
        <TextField
          label={t('registration.internalNotes')}
          multiline
          name="internalNotes"
          onChange={handleNotesChange}
          rows={2}
          sx={{ width: '100%', mt: 1 }}
          value={internalNotes}
        />
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          onClick={handleRefund}
          disabled={total === 0 || total <= handlingCost || handlingCost < 0 || refundAmount <= handlingCost}
        >
          {t('refund')}
        </Button>
        <Button variant="outlined" onClick={handleClose}>
          {t('cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
