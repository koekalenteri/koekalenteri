import type { ReactNode } from 'react'
import Typography from '@mui/material/Typography'
import { SCREEN_READER_ONLY } from './screenReaderOnly'

interface Props {
  readonly children: ReactNode
}

/**
 * The page's h1 for a screen reader, taking no room on screen: for a page whose visible top is a
 * notice, an event header or a printed list rather than its own name (KOE-1506, KOE-1519).
 */
export const HiddenPageTitle = ({ children }: Props) => (
  <Typography variant="h1" style={SCREEN_READER_ONLY}>
    {children}
  </Typography>
)
