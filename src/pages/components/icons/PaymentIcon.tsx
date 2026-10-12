import type { SvgIconProps } from '@mui/material'
import type { PaymentStatusKey } from '@/lib/payment'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import PauseCircleOutline from '@mui/icons-material/PauseCircleOutlined'
import { isPaidStatus } from '@/lib/payment'
import { DIM_OPACITY } from './constants'

interface PaymentIconProps extends SvgIconProps {
  dim?: boolean
  /** What the status line reads: the sign shows the same, so a fee that went back is not paid (KOE-1526). */
  status: PaymentStatusKey
}

export const PaymentIcon = ({ status, dim, ...props }: PaymentIconProps) => {
  const pending = status === 'paymentStatus.pending'
  const Icon = pending ? PauseCircleOutline : EuroOutlined
  const opacity = !dim || pending || isPaidStatus(status) ? 1 : DIM_OPACITY

  return <Icon {...props} opacity={opacity} />
}
