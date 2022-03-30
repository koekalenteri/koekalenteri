import { KeyboardArrowDown, KeyboardArrowRight } from '@mui/icons-material';
import { Box, Collapse, FormHelperText, IconButton, Typography } from '@mui/material';
import { ReactNode, useState } from 'react';

type CollapsibleSectionProps = {
  title: string
  border?: boolean
  initOpen?: boolean
  children?: ReactNode
  error?: boolean
  helperText?: string
}
export function CollapsibleSection({title, initOpen, children, error, helperText, border=true}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(initOpen !== false);
  return (
    <Box sx={{display: 'flex', alignItems: 'flex-start', pr: 1, borderTop: border ? '2px solid' : 'none', borderColor: 'background.selected'}}>
      <IconButton size="small" color="primary" onClick={() => setOpen(!open)}>
        {open ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
      </IconButton>
      <Box sx={{ pt: '5px', width: '100%' }}>
        <Box sx={{ userSelect: 'none', mb: '1px' }} onClick={() => setOpen(!open)}>
          <Typography>{title}</Typography>
          <FormHelperText
            error={error}
            sx={{ color: 'success.main', display: helperText ? 'block' : 'none' }}
          >
            {helperText}
          </FormHelperText>
        </Box>
        <Collapse in={open} timeout="auto">
          <Box sx={{p: 1, borderTop: '1px dashed #bdbdbd'}}>
            {children}
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
}
