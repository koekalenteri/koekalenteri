import type { TooltipProps } from '@mui/material/Tooltip'

import { styled } from '@mui/material'
import Box from '@mui/material/Box'
import Tooltip, { tooltipClasses } from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'

export interface TooltipContent {
  text: string
  icon: JSX.Element
}

const IconsTooltipContent = ({ items }: { items: TooltipContent[] }) => (
  <Box>
    {items.map((item) => (
      <Box key={item.text} display="flex" alignItems="center">
        {item.icon}&nbsp;<Typography fontSize="small">{item.text}</Typography>
      </Box>
    ))}
  </Box>
)

interface Props extends Omit<TooltipProps, 'title'> {
  items: TooltipContent[]
}

export const IconsTooltip = styled(({ className, items, children, ...props }: Props) => {
  if (!items.length) return <>{children}</>

  return (
    <Tooltip {...props} classes={{ popper: className }} title={<IconsTooltipContent items={items} />}>
      {children}
    </Tooltip>
  )
})({
  [`& .${tooltipClasses.tooltip}`]: {
    maxWidth: 'none',
  },
})
