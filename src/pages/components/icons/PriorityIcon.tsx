import type { SvgIconProps } from '@mui/material'
import type { hasPriority } from '../../../lib/registration'

import StarBorderOutlined from '@mui/icons-material/StarBorderOutlined'
import StarHalfOutlined from '@mui/icons-material/StarHalfOutlined'
import StarOutlined from '@mui/icons-material/StarOutlined'

import { DIM_OPACITY } from './constants'

interface PriorityIconProps extends SvgIconProps {
  dim?: boolean
  priority: ReturnType<typeof hasPriority>
}

export const PriorityIcon = ({ dim, priority, ...props }: PriorityIconProps) => {
  const Icon = priority === 0.5 ? StarHalfOutlined : priority ? StarOutlined : StarBorderOutlined
  const opacity = !dim || priority ? 1 : DIM_OPACITY

  return <Icon {...props} opacity={opacity} />
}
