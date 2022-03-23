import { KeyboardArrowDown, KeyboardArrowRight } from '@mui/icons-material';
import { Box, Collapse, Fade, FormHelperText, IconButton, LinearProgress, Typography } from '@mui/material';
import { ReactNode, useState } from 'react';

type CollapsibleSectionProps = {
  title: string
  initOpen?: boolean
  loading?: boolean
  children?: ReactNode
  error?: boolean
  helperText?: string
}
export function CollapsibleSection(props: CollapsibleSectionProps) {
  const [open, setOpen] = useState(props.initOpen !== false);
  return (
    <Box sx={{display: 'flex', alignItems: 'flex-start', pr: 1}}>
      <IconButton size="small" color="primary" onClick={() => setOpen(!open)}>
        {open ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
      </IconButton>
      <Box sx={{ pt: '6px', width: '100%' }}>
        <Box sx={{ borderBottom: '1px solid #bdbdbd', userSelect: 'none', mb: '1px' }} onClick={() => setOpen(!open)}>
          <Typography>{props.title}</Typography>
          <FormHelperText error={props.error} sx={{color: 'success.main'}}>{props.helperText}</FormHelperText>
        </Box>
        <Fade in={props.loading} color="secondary">
          <LinearProgress />
        </Fade>
        <Collapse in={open} timeout="auto" sx={{ mt: 1, pt: 1 }}>
          {props.children}
        </Collapse>
      </Box>
    </Box>
  );
}
