import type { ReactNode } from 'react'

import { useState } from 'react'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import FormHelperText from '@mui/material/FormHelperText'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'

interface Props {
  readonly border?: boolean
  readonly children?: ReactNode
  readonly error?: boolean
  readonly helperText?: string
  readonly initOpen?: boolean
  readonly onOpenChange?: (open: boolean) => void
  readonly open?: boolean
  readonly title: string
}

export default function CollapsibleSection({
  border = true,
  children,
  error,
  helperText,
  initOpen,
  onOpenChange,
  open,
  title,
}: Props) {
  const [state, setState] = useState(initOpen !== false)
  const controlled = open !== undefined
  const isOpen = controlled ? open : state
  const toggle = () => {
    const value = !isOpen
    if (!controlled) {
      setState(value)
    }
    if (onOpenChange) {
      onOpenChange(value)
    }
  }
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        pr: { xs: 0.5, sm: 1 },
        borderTop: border ? '2px solid' : 'none',
        borderColor: 'background.selected',
      }}
    >
      <IconButton size="small" color={'primary'} onClick={toggle} disabled={controlled && !onOpenChange}>
        {isOpen ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
      </IconButton>
      <Box sx={{ pt: '5px', width: 'calc(100% - 34px)', overflowX: 'auto' }}>
        <Box sx={{ userSelect: 'none', mb: '2px' }} onClick={toggle}>
          <Typography>{title}</Typography>
          <FormHelperText
            data-testid={error ? 'error-message' : 'info-message'}
            error={error}
            sx={{ color: 'success.main', display: helperText ? 'block' : 'none' }}
          >
            {helperText}
          </FormHelperText>
        </Box>
        <Collapse in={isOpen} timeout="auto">
          <Box sx={{ p: { xs: 0.5, sm: 1 }, borderTop: '1px dashed #bdbdbd' }}>{children}</Box>
        </Collapse>
      </Box>
    </Box>
  )
}
