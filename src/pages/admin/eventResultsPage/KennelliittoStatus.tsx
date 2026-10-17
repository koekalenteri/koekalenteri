import type { KcResultBadge } from '@/lib/kennelliittoResults'
import type { Registration } from '@/types'
import Chip from '@mui/material/Chip'
import Tooltip from '@mui/material/Tooltip'
import { useTranslation } from 'react-i18next'
import { kcResultBadge } from '@/lib/kennelliittoResults'

const COLORS: Record<KcResultBadge, 'default' | 'error' | 'success' | 'warning'> = {
  changed: 'warning',
  failed: 'error',
  sent: 'success',
  unsent: 'default',
}

interface Props {
  readonly registration: Pick<Registration, 'eventResult' | 'kcResult'>
}

/** Where a dog's result stands with Kennelliitto, beside the dog. Nothing for a dog with no result. */
export const KennelliittoStatus = ({ registration }: Props) => {
  const { t } = useTranslation()
  const badge = kcResultBadge(registration)
  if (!badge) return null

  const reasons =
    badge === 'changed' ? t('results.kennelliitto.badge.changedNote') : registration.kcResult?.errors?.join(' ')
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
