import { Fade, Paper, Popover } from '@mui/material';
import { ReactNode } from 'react';

type HelpPopoverProps = {
  anchorEl: HTMLButtonElement | null
  onClose: () => void
  children: ReactNode
}

export function HelpPopover({anchorEl, onClose, children}: HelpPopoverProps ) {
  const helpOpen = Boolean(anchorEl);

  return (
    <Popover
      anchorEl={anchorEl}
      open={helpOpen}
      anchorOrigin={{
        vertical: 'center',
        horizontal: 'center'
      }}
      transformOrigin={{
        vertical: 'top',
        horizontal: 'left'
      }}
      TransitionComponent={Fade}
      onClose={onClose}
    >
      <Paper sx={{
        maxWidth: 400,
        p: 1,
        backgroundColor: 'secondary.light'
      }}>
        {children}
      </Paper>
    </Popover>
  );
}
