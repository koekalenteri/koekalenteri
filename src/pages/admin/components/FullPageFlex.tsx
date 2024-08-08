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
        display: 'flex',
        p: 0,
        overflow: minWidth ? undefined : 'hidden',
        height: '100%',
        flexDirection: 'column',
        alignItems: 'flex-start',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          width: '100%',
          minHeight: 300,
          minWidth,
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

export default FullPageFlex
