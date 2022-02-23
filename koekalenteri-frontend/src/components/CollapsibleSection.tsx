import { KeyboardArrowDown, KeyboardArrowRight } from '@mui/icons-material';
import { Box, Collapse, Fade, IconButton, LinearProgress, Typography } from '@mui/material';
import { ReactNode, useState } from 'react';

export function CollapsibleSection({ title, children, loading, initOpen = true }: { title: string; initOpen?: boolean, loading?: boolean, children?: ReactNode; }) {
  const [open, setOpen] = useState(initOpen);
  return (
    <Box sx={{display: 'flex', alignItems: 'flex-start'}}>
      <IconButton size="small" color="primary" onClick={() => setOpen(!open)}>
        {open ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
      </IconButton>
      <Box sx={{ pt: '6px', width: '100%' }}>
        <Box sx={{ borderBottom: '1px solid #bdbdbd', userSelect: 'none', mb: '1px' }} onClick={() => setOpen(!open)}>
          <Typography>{title}</Typography>
        </Box>
        <Fade in={loading} color="secondary">
          <LinearProgress />
        </Fade>
        <Collapse in={open} timeout="auto" sx={{ mt: 1, pt: 1 }}>
          {children}
        </Collapse>
      </Box>
    </Box>
  );
}
