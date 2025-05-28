import { cloneElement } from 'react'

interface StatusIconProps {
  condition?: boolean
  icon: JSX.Element
  alwaysShow?: boolean
}

const StatusIcon = ({ condition, icon, alwaysShow = false }: StatusIconProps) =>
  cloneElement(icon, {
    fontSize: 'small',
    sx: { opacity: condition || alwaysShow ? 1 : 0.05 },
  })

export default StatusIcon
