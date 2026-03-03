import type { TooltipProps } from '@mui/material/Tooltip'
import type { PropsWithChildren, ReactNode } from 'react'
import { styled } from '@mui/material'
import Box from '@mui/material/Box'
import Tooltip, { tooltipClasses } from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { Children, Fragment, isValidElement } from 'react'

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
  // Treat empty fragments/arrays as "no icons" to avoid rendering a broken/empty tooltip.
  // NOTE: React.Children.toArray() does NOT flatten an empty <></> passed as a single node,
  // so we need to explicitly recurse into fragments.
  const hasIcons = (node: ReactNode): boolean => {
    const items = Children.toArray(node) // drops null/undefined/booleans
    if (items.length === 0) return false

    return items.some((child) => {
      if (!isValidElement(child)) return true // strings/numbers
      if (child.type === Fragment) return hasIcons(child.props.children)
      return true
    })
  }

  const hasAnyIcons = hasIcons(icons)
  if (!hasAnyIcons) return <>{children}</>

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
