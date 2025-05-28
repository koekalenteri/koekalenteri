import type { TooltipProps } from '@mui/material/Tooltip'
import type { PropsWithChildren, ReactNode } from 'react'

import { styled } from '@mui/material'
import Box from '@mui/material/Box'
import Tooltip, { tooltipClasses } from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

export const TooltipIcon = ({
  icon,
  text,
  condition = true,
}: {
  icon: JSX.Element
  text: string
  condition?: boolean
}) => {
  if (!condition) return null

  return (
    <Box display="flex" alignItems="center">
      {icon}&nbsp;<Typography fontSize="small">{text}</Typography>
    </Box>
  )
}

const IconsTooltipContent = ({ children }: PropsWithChildren) => <Box>{children}</Box>

interface Props extends Omit<TooltipProps, 'title'> {
  icons: ReactNode | undefined
}

export const IconsTooltip = styled(({ className, icons, children, ...props }: Props) => {
  if (!icons) return <>{children}</>

  return (
    <Tooltip {...props} classes={{ popper: className }} title={<IconsTooltipContent>{icons}</IconsTooltipContent>}>
      {children}
    </Tooltip>
  )
})({
  [`& .${tooltipClasses.tooltip}`]: {
    maxWidth: 'none',
  },
})
