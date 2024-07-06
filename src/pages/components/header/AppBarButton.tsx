import type { MouseEventHandler, ReactNode } from 'react'

import Box from '@mui/material/Box'
import Button from '@mui/material/Button'

interface Props {
  readonly active?: boolean
  readonly startIcon?: ReactNode
  readonly endIcon?: ReactNode
  readonly onClick?: MouseEventHandler
  readonly children?: ReactNode
  readonly label: string
}

export default function AppBarButton(props: Props) {
  return (
    <Button
      aria-label={props.label}
      onClick={props.onClick}
      startIcon={props.startIcon}
      endIcon={props.endIcon}
      color="secondary"
      sx={{
        borderBottom: props.active ? '2px solid #fcfcfc' : '2px solid transparent',
        borderRadius: 0,
        textTransform: 'none',
        textWrap: 'nowrap',
        py: '4px',
        '& .MuiButton-startIcon': { mr: { xs: 0, md: 1 } },
        '& .MuiButton-endIcon': { ml: { xs: 0, md: 1 } },
      }}
    >
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>{props.children}</Box>
    </Button>
  )
}
