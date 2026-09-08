import type { GridRowSelectionModel } from '@mui/x-data-grid'
import type { ChangeEventHandler } from 'react'
import type { MinimalEventForCost, RefundPaymentResponse, Registration, Transaction } from '../../../types'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormLabel from '@mui/material/FormLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import TextField from '@mui/material/TextField'
import { useSnackbar } from 'notistack'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APIError } from '../../../api/http'
import useDebouncedCallback from '../../../hooks/useDebouncedCallback'
import { errorSnackbarOptions } from '../../../lib/client/snackbar'
import { getPaymentBalance } from '../../../lib/cost'
import { rowSelectionModel } from '../../../lib/datagrid'
import { formatMoney } from '../../../lib/money'
import { canRefundExcess } from '../../../lib/payment'
import { GROUP_KEY_RESERVE } from '../../../lib/registration'
import { isObject } from '../../../lib/utils'
import { NullComponent } from '../../components/NullComponent'
import StyledDataGrid from '../../components/StyledDataGrid'
import { useAdminRegistrationActions } from '../state/registrations/actions'
import { RefundFooter } from './refundDialog/RefundFooter'
import { useRefundColumns } from './refundDialog/useRefundColumns'

const successMessages: Record<string, string> = {
  default:
    'Maksun palautus epäonnistui. Tarkista että Paytrailin tilillä on tarpeeksi katetta palautukseen, tai yritä myöhemmin uudelleen.',
  ok_default: 'Maksu palautettu',
  // Format: [status]_[provider]
  'ok_email refund':
    'Maksun palautus on kesken. Ilmoittautujalle on lähetetty sähköposti rahojen palautuksen viimeistelyä varten. Näet audit trailista, kun palautus on käsitelty loppuun.',
  pending_default: 'Maksun palautus on aloitettu. Näet audit trailista, kun palautus on käsitelty loppuun.',
  'pending_email refund':
    'Maksun palautus on aloitettu. Ilmoittautujalle on lähetetty sähköposti rahojen palautuksen viimeistelyä varten. Näet audit trailista, kun palautus on käsitelty loppuun.',
}

const refundTextKey = (excessOnly: boolean, canHaveHandlingCosts: boolean) => {
  if (excessOnly) return 'registration.refundDialog.excessText'
  return canHaveHandlingCosts ? 'registration.refundDialog.costsText' : 'registration.refundDialog.noCostsText'
}

const errorMessages = {
  '404': 'Maksutapahtumaa ei löydy. Tapahtuma on todennäköisesti liian vanha palautettavaksi.',
  default:
    'Maksun palautus epäonnistui. Tarkista että Paytrailin tilillä on tarpeeksi katetta palautukseen, tai yritä myöhemmin uudelleen.',
  refund_balance: (remainingAmount: string) =>
    `Palautettava määrä ylittää palauttamattoman maksun osuuden. Palauttamatta: ${remainingAmount}`,
}

interface Props {
  /** The trial's fee is what the payment is measured against: it tells whether a part was paid over. */
  readonly event: MinimalEventForCost
  readonly registration: Registration
  readonly open?: boolean
  readonly onClose?: () => void
}

/**
 * What the refund returns: the part paid over the fee alone (KOE-1382), or the selected payment
 * less whatever handling fee the secretary keeps.
 */
type RefundMode = 'excess' | 'payment'

const transactionAmount = (t: Transaction) => (t.type === 'refund' ? -1 * (t.amount + (t.handlingCost ?? 0)) : t.amount)
const DEFAULT_HANDLING_COST = 500
const defaultHandlingCost = (registration: Registration) =>
  (registration.group?.key ?? GROUP_KEY_RESERVE) !== GROUP_KEY_RESERVE && registration.refundHandlingCost === undefined
    ? DEFAULT_HANDLING_COST
    : 0
const defaultRefundMode = (excessAvailable: boolean): RefundMode => (excessAvailable ? 'excess' : 'payment')

export const RefundDailog = ({ event, open, registration, onClose }: Props) => {
  const { t } = useTranslation()
  const { enqueueSnackbar } = useSnackbar()
  const [loading, setLoading] = useState<boolean>(false)
  const [loadedId, setLoadedId] = useState<string>('')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selection, setSelection] = useState<GridRowSelectionModel>()
  const [handlingCost, setHandlingCost] = useState<number>(defaultHandlingCost(registration))
  const [internalNotes, setInternalNotes] = useState(registration.internalNotes ?? '')
  const balance = useMemo(() => getPaymentBalance(event, registration), [event, registration])
  const excessAvailable = canRefundExcess(event, registration)
  const [refundMode, setRefundMode] = useState<RefundMode>(defaultRefundMode(excessAvailable))
  const excessOnly = excessAvailable && refundMode === 'excess'
  const excessCents = Math.round(balance.excess * 100)
  const actions = useAdminRegistrationActions(registration.eventId)
  const columns = useRefundColumns()

  const okTransactions = useMemo(() => transactions.filter((t) => t.status === 'ok'), [transactions])

  const selectedTransactions = useMemo(
    () => okTransactions.filter((t) => selection?.ids.has(t.transactionId)),
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
  // What goes back: the excess of what was paid over the fee, capped by the payment it comes out of,
  // or the selected payment less the handling fee.
  const refundBase = Math.min(total, refundAmount)
  const refundTotal = excessOnly ? Math.min(excessCents, refundBase) : refundBase - handlingCost
  const registrationVersion = registration
    ? `${registration.id}:${registration.updatedAt?.getTime() ?? ''}:${registration.paymentStatus ?? ''}:${registration.refundStatus ?? ''}`
    : ''

  useEffect(() => {
    if (!open || !registration || registrationVersion === loadedId || loading) return

    setLoading(true)

    actions
      .transactions(registration.eventId, registration.id)
      .then((loaded) => {
        setTransactions((loaded ?? []).filter((t) => t.status !== 'fail' && t.status !== 'new'))
        setLoading(false)
        setLoadedId(registrationVersion)
      })
      .catch(() => {
        setTransactions([])
        setLoading(false)
        setLoadedId(registrationVersion)
      })
  }, [actions, loadedId, loading, open, registration, registrationVersion])

  useEffect(() => {
    const payments = okTransactions.filter((t) => t.type === 'payment')
    if (payments.length === 1) {
      const [payment] = payments
      if (payment.transactionId) {
        setSelection(rowSelectionModel([payment.transactionId]))
      }
      if (!payment.items && handlingCost) {
        setHandlingCost(0)
      }
    }
  }, [handlingCost, okTransactions])

  useEffect(() => {
    setInternalNotes(registration.internalNotes ?? '')
  }, [registration.internalNotes])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset local edits when switching registrations
  useEffect(() => {
    setHandlingCost(defaultHandlingCost(registration))
    setRefundMode(defaultRefundMode(excessAvailable))
  }, [registration.id, registration.refundHandlingCost, registration.group?.key, excessAvailable])

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
  const handleModeChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (e) => setRefundMode(e.target.value === 'excess' ? 'excess' : 'payment'),
    []
  )

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
    [enqueueSnackbar, handleClose]
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

  const extractRefundErrorMessage = useCallback((error: APIError): string | null => {
    if (!isObject(error.body)) return null

    if (typeof error.body.message === 'string' && error.body.message) {
      return error.body.message
    }

    if (typeof error.body.error === 'string' && error.body.error) {
      try {
        const details = JSON.parse(error.body.error)
        if (typeof details?.message === 'string' && details.message) {
          return `Maksun palautus epäonnistui Paytrailissa: ${details.message}`
        }
      } catch {
        return null
      }
    }

    return null
  }, [])

  const handleRefundError = useCallback(
    (error: unknown) => {
      // Early return if not an API error
      if (!(error instanceof APIError)) return

      // Handle specific error types
      switch (error.status) {
        case 404: {
          // Transaction not found error
          enqueueSnackbar(errorMessages['404'], errorSnackbarOptions)
          return
        }

        case 400: {
          // Check for refund balance error
          const remainingAmount = isObject(error.body) ? extractRemainingBalance(error.body?.error) : null
          if (remainingAmount) {
            enqueueSnackbar(errorMessages.refund_balance(remainingAmount), errorSnackbarOptions)
            return
          }
          break
        }
      }

      const message = extractRefundErrorMessage(error)
      if (message) {
        enqueueSnackbar(message, errorSnackbarOptions)
        return
      }

      // Default error message for all other cases
      enqueueSnackbar(errorMessages.default, errorSnackbarOptions)
    },
    [enqueueSnackbar, extractRefundErrorMessage, extractRemainingBalance]
  )

  const handleRefund = useCallback(async () => {
    if (!selectedTransactions.length) return

    const transaction = selectedTransactions[0]

    try {
      const response = await actions.refund(
        registration,
        transaction.transactionId,
        refundTotal,
        excessOnly ? 0 : handlingCost
      )
      if (!response || response.status === 'fail') {
        // For failed refunds, show the default error message
        enqueueSnackbar(errorMessages.default, errorSnackbarOptions)
      } else {
        showSuccessMessage(response)
      }
    } catch (error) {
      handleRefundError(error)
    }
  }, [
    selectedTransactions,
    refundTotal,
    excessOnly,
    handlingCost,
    actions,
    registration,
    showSuccessMessage,
    handleRefundError,
    enqueueSnackbar,
  ])

  return (
    <Dialog open={!!open} maxWidth="md" fullWidth>
      <DialogTitle>
        {t('registration.refundDialog.title', { payer: registration.payer?.name, regNo: registration.dog.regNo })}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>{t('registration.refundDialog.text')}</DialogContentText>
        {excessAvailable && (
          <FormControl sx={{ mb: 1 }}>
            <FormLabel id="refund-mode-label">
              {t('registration.refundDialog.excessTitle', {
                cost: formatMoney(balance.cost),
                paid: formatMoney(balance.paid),
              })}
            </FormLabel>
            <RadioGroup
              aria-labelledby="refund-mode-label"
              name="refundMode"
              onChange={handleModeChange}
              value={refundMode}
            >
              <FormControlLabel
                control={<Radio size="small" />}
                label={t('registration.refundDialog.excessOnly', { amount: formatMoney(balance.excess) })}
                value="excess"
              />
              <FormControlLabel
                control={<Radio size="small" />}
                label={t('registration.refundDialog.wholePayment')}
                value="payment"
              />
            </RadioGroup>
          </FormControl>
        )}
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
              canHaveHandlingCosts: canHaveHandlingCosts && !excessOnly,
              handlingCost: excessOnly ? 0 : handlingCost,
              onHandlingCostChange: handleCostChange,
              refundTotal,
              selectedTotal: refundAmount,
              total,
            },
          }}
        ></StyledDataGrid>
        {(registration.refundHandlingCost ?? 0) > 0 && (
          <DialogContentText sx={{ my: 1 }}>
            <span>{t('registration.refundDialog.previouslyChargedHandlingCost')}:</span>{' '}
            <strong>{formatMoney(registration.refundHandlingCost ?? 0)}</strong>
          </DialogContentText>
        )}
        <DialogContentText
          sx={{
            display: selectedTransactions.length ? undefined : 'none',
            my: 1,
          }}
        >
          {t(refundTextKey(excessOnly, canHaveHandlingCosts))}
        </DialogContentText>
        <TextField
          label={t('registration.internalNotes')}
          multiline
          name="internalNotes"
          onChange={handleNotesChange}
          rows={2}
          sx={{ mt: 1, width: '100%' }}
          value={internalNotes}
        />
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={handleRefund} disabled={refundTotal <= 0 || handlingCost < 0}>
          {t('refund')}
        </Button>
        <Button variant="outlined" onClick={handleClose}>
          {t('cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
