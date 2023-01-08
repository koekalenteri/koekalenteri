import { MouseEventHandler, ReactNode } from 'react'
import { Box, Button } from '@mui/material'

interface Props {
  startIcon?: ReactNode
  endIcon?: ReactNode
  onClick?: MouseEventHandler
  children?: ReactNode
}

export default function AppBarButton(props: Props) {
  return (
    <Button
      onClick={props.onClick}
      startIcon={props.startIcon}
      endIcon={props.endIcon}
      sx={{
        textTransform: 'none',
        '& .MuiButton-startIcon': { marginRight: { xs: 0, sm: 2 } },
        '& .MuiButton-endIcon': { marginLeft: { xs: 0, sm: 2 } },
      }}
    >
      <Box sx={{ display: { xs: 'none', sm: 'block' } }}>{props.children}</Box>
    </Button>
  )
}
