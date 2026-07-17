import type { ReactNode } from 'react'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import FormHelperText from '@mui/material/FormHelperText'
import IconButton from '@mui/material/IconButton'
import Typography from '@mui/material/Typography'
import { useState } from 'react'

interface Props {
  readonly border?: boolean
  readonly children?: ReactNode
  readonly compact?: boolean
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
  compact = false,
  error,
  helperText,
  initOpen,
  onOpenChange,
  open,
  title,
}: Props) {
  const [state, setState] = useState(initOpen !== false)
  const toggleWidth = compact ? 24 : 34
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
        alignItems: 'flex-start',
        borderTop: border ? '2px solid' : 'none',
        borderTopColor: 'background.selected',
        display: 'flex',
        pr: { sm: 1, xs: 0.5 },
      }}
    >
      <IconButton
        size="small"
        color={'primary'}
        disabled={controlled && !onOpenChange}
        onClick={toggle}
        sx={{ flex: `0 0 ${toggleWidth}px`, mt: compact ? '5px' : undefined, p: compact ? 0 : undefined }}
      >
        {isOpen ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
      </IconButton>
      <Box sx={{ overflowX: 'auto', pt: '5px', width: `calc(100% - ${toggleWidth}px)` }}>
        <Box sx={{ mb: '2px', userSelect: 'none' }} onClick={toggle}>
          <Typography>{title}</Typography>
          <FormHelperText error={error} sx={{ color: 'success.main', display: helperText ? 'block' : 'none' }}>
            {helperText}
          </FormHelperText>
        </Box>
        <Collapse in={isOpen} timeout="auto">
          <Box sx={{ p: compact ? 0 : { sm: 1, xs: 0.5 } }}>{children}</Box>
        </Collapse>
      </Box>
    </Box>
  )
}
