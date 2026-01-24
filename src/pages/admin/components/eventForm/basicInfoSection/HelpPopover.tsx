import type { ReactNode } from 'react'
import Fade from '@mui/material/Fade'
import Paper from '@mui/material/Paper'
import Popover from '@mui/material/Popover'

interface Props {
  readonly anchorEl: HTMLButtonElement | null
  readonly onClose: () => void
  readonly children: ReactNode
}

export default function HelpPopover({ anchorEl, onClose, children }: Props) {
  const helpOpen = Boolean(anchorEl)

  return (
    <Popover
      anchorEl={anchorEl}
      open={helpOpen}
      anchorOrigin={{
        horizontal: 'center',
        vertical: 'center',
      }}
      transformOrigin={{
        horizontal: 'left',
        vertical: 'top',
      }}
      slots={{
        transition: Fade,
      }}
      onClose={onClose}
    >
      <Paper
        sx={{
          backgroundColor: 'secondary.light',
          maxWidth: 400,
          p: 1,
        }}
      >
        {children}
      </Paper>
    </Popover>
  )
}
