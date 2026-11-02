import type { TFunction } from 'i18next'
import type { KcBadge, KcResultBadge } from '@/lib/kennelliittoResults'
import type { Registration } from '@/types'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import { useTranslation } from 'react-i18next'
import { dogNotAddedText, problemsText } from '../eventViewPage/infoPanel/kennelliittoMessages'

/** The badges a dog shows. A dog with no result shows none: the row says so already. */
type ShownBadge = Exclude<KcResultBadge, 'notRecorded'>

const COLORS: Record<ShownBadge, 'default' | 'error' | 'success' | 'warning'> = {
  blocked: 'error',
  changed: 'warning',
  failed: 'error',
  ready: 'default',
  sentGone: 'warning',
  unchanged: 'success',
}

/** The label of each badge: where the send dialog puts the dog, worded for a column beside it. */
const LABELS: Record<ShownBadge, 'blocked' | 'changed' | 'failed' | 'sent' | 'sentGone' | 'unsent'> = {
  blocked: 'blocked',
  changed: 'changed',
  failed: 'failed',
  ready: 'unsent',
  sentGone: 'sentGone',
  unchanged: 'sent',
}

const isShown = (status: KcResultBadge): status is ShownBadge => status !== 'notRecorded'

interface Props {
  readonly badge?: KcBadge
  readonly registration: Pick<Registration, 'dog' | 'kcResult'>
}

/**
 * What the badge explains on hover: a foreign dog Kennelliitto did not add says so whether or not it gave
 * reasons (KOE-1201); why a result cannot be sent; what a change or a removed result means; otherwise
 * Kennelliitto's reasons for a refusal.
 */
const tooltipOf = (t: TFunction, { problems, status }: KcBadge, { dog, kcResult }: Props['registration']) => {
  if (kcResult?.dogNotAdded && status === 'failed') {
    return dogNotAddedText(t, { errors: kcResult.errors, regNo: dog.regNo })
  }
  if (status === 'blocked') return problemsText(t, problems)
  if (status === 'changed') return t('results.kennelliitto.badge.changedNote')
  if (status === 'sentGone') return t('results.kennelliitto.dogStatus.sentGone')
  return kcResult?.errors?.join(' ')
}

/** Where a dog's result stands with Kennelliitto, beside the dog, as the send dialog reads it. */
export const KennelliittoStatus = ({ badge, registration }: Props) => {
  const { t } = useTranslation()
  if (!badge || !isShown(badge.status)) return null

  const { status } = badge
  const reasons = tooltipOf(t, badge, registration)
  const chip = (
    <Chip
      color={COLORS[status]}
      label={t(`results.kennelliitto.badge.${LABELS[status]}`)}
      size="small"
      variant={status === 'ready' || status === 'blocked' ? 'outlined' : 'filled'}
    />
  )

  return reasons ? <Tooltip title={reasons}>{chip}</Tooltip> : chip
}
