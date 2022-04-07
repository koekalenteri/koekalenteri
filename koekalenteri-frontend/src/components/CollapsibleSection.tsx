import { KeyboardArrowDown, KeyboardArrowRight } from '@mui/icons-material';
import { Box, Collapse, FormHelperText, IconButton, Typography } from '@mui/material';
import { ReactNode, useState } from 'react';

type CollapsibleSectionProps = {
  border?: boolean
  children?: ReactNode
  error?: boolean
  helperText?: string
  initOpen?: boolean
  onOpenChange?: (open: boolean) => void;
  open?: boolean
  title: string
}
export function CollapsibleSection({ border = true, children, error, helperText, initOpen, onOpenChange, open, title }: CollapsibleSectionProps) {
  const [state, setState] = useState(initOpen !== false);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : state;
  const toggle = () => {
    const value = !isOpen;
    if (!controlled) {
      setState(value);
    }
    if (onOpenChange) {
      onOpenChange(value);
    }
  }
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start', pr: 1, borderTop: border ? '2px solid' : 'none', borderColor: 'background.selected' }}>
      <IconButton size="small" color="primary" onClick={toggle}>
        {isOpen ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
      </IconButton>
      <Box sx={{ pt: '5px', width: 'calc(100% - 34px)', overflowX: 'auto' }}>
        <Box sx={{ userSelect: 'none', mb: '1px' }} onClick={toggle}>
          <Typography>{title}</Typography>
          <FormHelperText
            error={error}
            sx={{ color: 'success.main', display: helperText ? 'block' : 'none' }}
          >
            {helperText}
          </FormHelperText>
        </Box>
        <Collapse in={isOpen} timeout="auto">
          <Box sx={{ p: 1, borderTop: '1px dashed #bdbdbd' }}>
            {children}
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
}
