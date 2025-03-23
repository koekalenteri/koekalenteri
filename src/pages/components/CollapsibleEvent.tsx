import type { PropsWithChildren, ReactNode } from 'react'

import { useCallback } from 'react'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import Grid2 from '@mui/material/Grid2'
import IconButton from '@mui/material/IconButton'
import { useRecoilState } from 'recoil'

import { openedEventAtom } from '../recoil'

interface Props {
  readonly eventId: string
  readonly header: ReactNode
  readonly odd?: boolean
}

export const CollapsibleEvent = ({ eventId, odd, header, children }: PropsWithChildren<Props>) => {
  const [open, setOpen] = useRecoilState(openedEventAtom(eventId))

  const handleClick = useCallback(() => setOpen(!open), [open, setOpen])

  return (
    <Box
      sx={{
        borderBottom: '2px solid',
        borderColor: 'background.hover',
        py: 1,
        pr: 1,
        bgcolor: odd ? 'background.oddRow' : 'background.default',
        overflow: 'hidden',
        width: '100%',
      }}
      component="article"
    >
      <Grid2 container spacing={0} alignItems="start" role="heading" aria-level={2}>
        <Grid2>
          <IconButton aria-label="expand row" size="small" color="primary" onClick={handleClick}>
            {open ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
          </IconButton>
        </Grid2>
        <Grid2 container onClick={handleClick} spacing={0} columnSpacing={1} size="grow">
          {header}
        </Grid2>
      </Grid2>
      <Collapse
        in={open}
        sx={{
          borderTop: '1px solid',
          borderTopColor: 'divider',
          ml: '34px',
          mt: 0,
        }}
        timeout="auto"
        role="region"
      >
        {children}
      </Collapse>
    </Box>
  )
}
