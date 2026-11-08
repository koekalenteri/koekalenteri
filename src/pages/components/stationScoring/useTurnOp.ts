import type { StationTurnOp } from '@/types'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { errorSnackbarOptions } from '@/lib/client/snackbar'

/**
 * Sends one turn operation at a time from the post's clock (KOE-1259). A second tap while the first is on
 * its way is dropped rather than queued: one tap moves the day along, and a gloved double tap must not move
 * it twice. A failed send says so and leaves the timeline as the server has it.
 */
export const useTurnOp = (onTurn: (op: StationTurnOp) => Promise<unknown>) => {
  const { t } = useTranslation()
  const busyRef = useRef(false)

  return useCallback(
    async (op: StationTurnOp) => {
      if (busyRef.current) return
      busyRef.current = true
      try {
        await onTurn(op)
      } catch {
        enqueueSnackbar(t('liveStatus.turnSaveFailed'), errorSnackbarOptions)
      } finally {
        busyRef.current = false
      }
    },
    [onTurn, t]
  )
}
