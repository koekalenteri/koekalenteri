import type { MouseEventHandler, ReactNode } from 'react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'

interface Props {
  readonly startIcon?: ReactNode
  readonly endIcon?: ReactNode
  readonly onClick?: MouseEventHandler
  readonly children?: ReactNode
}

export default function AppBarButton(props: Props) {
  return (
    <Button
      onClick={props.onClick}
      startIcon={props.startIcon}
      endIcon={props.endIcon}
      color="secondary"
      sx={{
        textTransform: 'none',
        '& .MuiButton-startIcon': { ml: 1, mr: { xs: 0, sm: 1 } },
        '& .MuiButton-endIcon': { ml: { xs: 0, sm: 1 } },
      }}
    >
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>{props.children}</Box>
    </Button>
  )
}
