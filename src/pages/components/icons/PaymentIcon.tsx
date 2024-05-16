import type { SvgIconProps } from '@mui/material'
import type { Registration } from '../../../types'

import EuroOutlined from '@mui/icons-material/EuroOutlined'
import PauseCircleOutline from '@mui/icons-material/PauseCircleOutline'

import { DIM_OPACITY } from './constants'

interface PaymentIconProps extends SvgIconProps {
  dim?: boolean
  paymentStatus: Registration['paymentStatus']
}

export const PaymentIcon = ({ paymentStatus: status, dim, ...props }: PaymentIconProps) => {
  const Icon = status === 'PENDING' ? PauseCircleOutline : EuroOutlined
  const opacity = !dim || status === 'PENDING' || status === 'SUCCESS' ? 1 : DIM_OPACITY

  return <Icon {...props} opacity={opacity} />
}
