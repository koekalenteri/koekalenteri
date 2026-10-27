import type { TFunction } from 'i18next'
import type { KcResultBadge } from '@/lib/kennelliittoResults'
import type { Registration } from '@/types'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import { useTranslation } from 'react-i18next'
import { kcResultBadge } from '@/lib/kennelliittoResults'
import { dogNotAddedText } from '../eventViewPage/infoPanel/kennelliittoMessages'

const COLORS: Record<KcResultBadge, 'default' | 'error' | 'success' | 'warning'> = {
  changed: 'warning',
  failed: 'error',
  sent: 'success',
  unsent: 'default',
}

interface Props {
  readonly registration: Pick<Registration, 'dog' | 'eventResult' | 'kcResult'>
}

/**
 * What the badge explains on hover: a foreign dog Kennelliitto did not add says so whether or not it gave
 * reasons (KOE-1201); otherwise an edit since the sending, or Kennelliitto's reasons for a refusal.
 */
const tooltipOf = (t: TFunction, badge: KcResultBadge, { dog, kcResult }: Props['registration']) => {
  if (kcResult?.dogNotAdded) return dogNotAddedText(t, { errors: kcResult.errors, regNo: dog.regNo })
  if (badge === 'changed') return t('results.kennelliitto.badge.changedNote')
  return kcResult?.errors?.join(' ')
}

/** Where a dog's result stands with Kennelliitto, beside the dog. Nothing for a dog with no result. */
export const KennelliittoStatus = ({ registration }: Props) => {
  const { t } = useTranslation()
  const badge = kcResultBadge(registration)
  if (!badge) return null

  const reasons = tooltipOf(t, badge, registration)
  const chip = (
    <Chip
      color={COLORS[badge]}
      label={t(`results.kennelliitto.badge.${badge}`)}
      size="small"
      variant={badge === 'unsent' ? 'outlined' : 'filled'}
    />
  )

  return reasons ? <Tooltip title={reasons}>{chip}</Tooltip> : chip
}
