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
        '& .MuiButton-endIcon': { ml: { md: 1, xs: 0 } },
        '& .MuiButton-startIcon': { mr: { md: 1, xs: 0 } },
        borderBottom: props.active ? '2px solid #fcfcfc' : '2px solid transparent',
        borderRadius: 0,
        py: '4px',
        textTransform: 'none',
        textWrap: 'nowrap',
      }}
    >
      <Box sx={{ display: { md: 'block', xs: 'none' } }}>{props.children}</Box>
    </Button>
  )
}
