import type { ReactNode } from 'react'

import Box from '@mui/material/Box'

type FullPageFlexProps = {
  children?: ReactNode
}

const FullPageFlex = (props: FullPageFlexProps) => {
  return (
    <Box
      sx={{
        display: 'flex',
        p: 0,
        overflow: 'hidden',
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
          minHeight: 400,
        }}
      >
        {props.children}
      </Box>
    </Box>
  )
}

export default FullPageFlex
