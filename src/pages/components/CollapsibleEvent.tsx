import type { PropsWithChildren, ReactNode } from 'react'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight'
import Box from '@mui/material/Box'
import Collapse from '@mui/material/Collapse'
import Grid from '@mui/material/Grid'
import IconButton from '@mui/material/IconButton'
import { useCallback } from 'react'
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
        bgcolor: odd ? 'background.oddRow' : 'background.evenRow',
        borderBottom: '2px solid',
        borderColor: 'background.hover',
        overflow: 'hidden',
        pr: 1,
        py: 1,
        width: '100%',
      }}
      component="article"
    >
      <Grid container spacing={0} alignItems="start" role="heading" aria-level={2}>
        <Grid>
          <IconButton aria-label="expand row" size="small" color="primary" onClick={handleClick}>
            {open ? <KeyboardArrowDown /> : <KeyboardArrowRight />}
          </IconButton>
        </Grid>
        <Grid container onClick={handleClick} spacing={0} columnSpacing={1} size="grow">
          {header}
        </Grid>
      </Grid>
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
