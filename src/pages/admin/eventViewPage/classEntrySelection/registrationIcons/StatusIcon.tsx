import type { ReactElement } from 'react'
import { cloneElement } from 'react'

interface IconProps {
  fontSize?: 'small'
  sx?: { opacity: number }
}

interface StatusIconProps {
  condition?: boolean
  icon: ReactElement<IconProps>
  alwaysShow?: boolean
}

const StatusIcon = ({ condition, icon, alwaysShow = false }: StatusIconProps) =>
  cloneElement(icon, {
    fontSize: 'small',
    sx: { opacity: condition || alwaysShow ? 1 : 0.05 },
  })

export default StatusIcon
