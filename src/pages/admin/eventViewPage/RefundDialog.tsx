import type { GridRowSelectionModel } from '@mui/x-data-grid'
import type { ChangeEventHandler } from 'react'
import type { Registration, Transaction } from '../../../types'

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

  const handleRefund = useCallback(async () => {
    const transaction = selectedTransactions[0]
    try {
      const amount = Math.min(total, transaction.amount) - handlingCost
      const response = await actions.refund(transaction.transactionId, amount)
      if (response?.status === 'ok') {
        enqueueSnackbar('Maksu palautettu', { variant: 'success' })
        handleClose()
      } else if (response?.status === 'pending') {
        if (response.provider === 'email refund') {
          enqueueSnackbar(
            'Maksun palautus on aloitettu. Ilmoittautujalle on lähetetty sähköposti rahojen palautuksen viimeistelyä varten. Näet audit trailista, kun palautus on käsitelty loppuun.',
            { variant: 'success' }
          )
        } else {
          enqueueSnackbar('Maksun palautus on aloitettu. Näet audit trailista, kun palautus on käsitelty loppuun.', {
            variant: 'success',
          })
        }
        handleClose()
      } else {
        enqueueSnackbar(
          'MMaksun palautus epäonnistui. Tarkista että Paytrailin tilillä on tarpeeksi katetta palautukseen, tai yritä myöhemmin uudelleen.',
          { variant: 'error' }
        )
      }
    } catch (e) {
      if (e instanceof APIError) {
        if (e.status === 404) {
          enqueueSnackbar('Maksutapahtumaa ei löydy. Tapahtuma on todennäköisesti liian vanha palautettavaksi.', {
            variant: 'error',
          })
          return
        }
        if (e.status === 400) {
          const details = JSON.parse(e.body?.error)
          if (details?.message === 'Refund amount exceeds the remaining refund balance') {
            const remaining = details?.meta?.invalidRefunds?.[0].remainingRefundBalance
            const remainingAmount = remaining ? formatMoney(remaining / 100) : '(ei tiedossa)'
            enqueueSnackbar(
              `Palautettava määrä ylittää palauttamattoman maksun osuuden. Palauttamatta: ${remainingAmount}`,
              {
                variant: 'error',
              }
            )
            return
          }
        }
        enqueueSnackbar(
          'Maksun palautus epäonnistui. Tarkista että Paytrailin tilillä on tarpeeksi katetta palautukseen, tai yritä myöhemmin uudelleen.',
          {
            variant: 'error',
          }
        )
      }
    }
  }, [actions, enqueueSnackbar, handlingCost, handleClose, selectedTransactions, total])

  return (
    <Dialog open={!!open} maxWidth="md" fullWidth>
      <DialogTitle>
        {t('registration.refundDialog.title', { regNo: registration.dog.regNo, payer: registration.payer.name })}
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>{t('registration.refundDialog.text')}</DialogContentText>
        <StyledDataGrid
          autoHeight
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
          value={registration.internalNotes}
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
