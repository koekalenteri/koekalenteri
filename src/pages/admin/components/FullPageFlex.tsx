import type { ReactNode } from 'react'
import Box from '@mui/material/Box'

interface Props {
  children?: ReactNode
  minWidth?: number
}

const FullPageFlex = ({ children, minWidth }: Props) => {
  return (
    <Box
      sx={{
        alignItems: 'flex-start',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: minWidth ? undefined : 'hidden',
        p: 0,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          minHeight: 300,
          minWidth,
          width: '100%',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

export default FullPageFlex
